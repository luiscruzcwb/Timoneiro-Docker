package api

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"github.com/luiscruzcwb/timoneiro/internal/api/handlers"
	apiws "github.com/luiscruzcwb/timoneiro/internal/api/ws"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/engine"
	"github.com/luiscruzcwb/timoneiro/internal/notifications"
	log "github.com/sirupsen/logrus"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Server is the HTTP API server
type Server struct {
	DB      *db.DB
	Engine  *engine.Engine
	Hub     *apiws.Hub
	Manager *notifications.Manager
	Port    string
	WebFS   fs.FS
}

// NewServer creates a configured Server
func NewServer(database *db.DB, eng *engine.Engine, hub *apiws.Hub, nm *notifications.Manager, port string, webFS fs.FS) *Server {
	return &Server{
		DB:      database,
		Engine:  eng,
		Hub:     hub,
		Manager: nm,
		Port:    port,
		WebFS:   webFS,
	}
}

// Start begins listening on the configured port
func (s *Server) Start() error {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	envH := &handlers.EnvironmentHandler{DB: s.DB}
	ctrH := &handlers.ContainerHandler{DB: s.DB, Engine: s.Engine}
	histH := &handlers.HistoryHandler{DB: s.DB}
	notifH := &handlers.NotificationHandler{DB: s.DB, Manager: s.Manager}
	updH := &handlers.UpdateHandler{DB: s.DB, Engine: s.Engine}
	settH := &handlers.SettingsHandler{DB: s.DB}
	regH := &handlers.RegistryHandler{DB: s.DB}
	authH := &handlers.AuthHandler{DB: s.DB}

	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Get("/status", authH.Status)
			r.Post("/setup", authH.Setup)
			r.Post("/login", authH.Login)
			r.Post("/logout", authH.Logout)

			r.Group(func(r chi.Router) {
				r.Use(handlers.RequireAuth(s.DB))
				r.Get("/me", authH.Me)
				r.Post("/change-password", authH.ChangePassword)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(handlers.RequireAuth(s.DB))

			r.Get("/environments", envH.List)
			r.Post("/environments", envH.Create)
			r.Post("/environments/test", envH.TestConnection)
			r.Put("/environments/{id}", envH.Update)
			r.Delete("/environments/{id}", envH.Delete)
			r.Get("/environments/{id}/containers", envH.ListContainers)

			r.Get("/containers", ctrH.List)
			r.Post("/containers/check", ctrH.TriggerCheck)
			r.Post("/containers/{id}/update", ctrH.TriggerUpdate)
			r.Post("/containers/{id}/rollback", ctrH.Rollback)
			r.Patch("/containers/{id}/tags", ctrH.UpdateTags)

			r.Get("/updates", updH.List)
			r.Post("/updates/{id}/approve", updH.Approve)
			r.Post("/updates/{id}/ignore", updH.Ignore)
			r.Patch("/updates/{id}/notes", updH.PatchNotes)

			r.Get("/history", histH.List)

			r.Get("/settings", settH.Get)
			r.Put("/settings", settH.Update)

			r.Get("/registries", regH.List)
			r.Post("/registries", regH.Create)
			r.Post("/registries/test", regH.Test)
			r.Put("/registries/{id}", regH.Update)
			r.Delete("/registries/{id}", regH.Delete)

			r.Get("/notifications/channels", notifH.List)
			r.Post("/notifications/channels", notifH.Create)
			r.Put("/notifications/channels/{id}", notifH.Update)
			r.Delete("/notifications/channels/{id}", notifH.Delete)
			r.Post("/notifications/channels/{id}/test", notifH.Test)

			r.Get("/ws", s.handleWebSocket)
		})
	})

	// Serve frontend — SPA fallback: unknown paths → index.html
	subFS, _ := fs.Sub(s.WebFS, "dist")
	fileHandler := http.FileServer(http.FS(subFS))
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		upath := strings.TrimPrefix(r.URL.Path, "/")
		if _, err := fs.Stat(subFS, upath); err != nil {
			r.URL.Path = "/"
		}
		fileHandler.ServeHTTP(w, r)
	})

	addr := ":" + s.Port
	log.Infof("Timoneiro API listening on %s", addr)
	return http.ListenAndServe(addr, r)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Errorf("WebSocket upgrade failed: %v", err)
		return
	}
	s.Hub.ServeWS(conn)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
