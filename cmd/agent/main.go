package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	dockerclient "github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	log "github.com/sirupsen/logrus"
)

func main() {
	token := os.Getenv("TIMONEIRO_AGENT_TOKEN")
	if token == "" {
		log.Fatal("TIMONEIRO_AGENT_TOKEN is required")
	}
	port := os.Getenv("TIMONEIRO_AGENT_PORT")
	if port == "" {
		port = "1895"
	}

	cli, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("Failed to connect to Docker: %v", err)
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ping, err := cli.Ping(ctx)
	if err != nil {
		log.Fatalf("Docker ping failed: %v", err)
	}
	log.Infof("Timoneiro Agent starting | Docker %s | port :%s", ping.APIVersion, port)

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(rateLimiter(60, time.Minute)) // 60 req/min por IP
	r.Use(authMiddleware(token))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"status": "ok", "docker": ping.APIVersion})
	})

	r.Get("/containers", func(w http.ResponseWriter, r *http.Request) {
		list, err := cli.ContainerList(r.Context(), container.ListOptions{
			Filters: filters.NewArgs(filters.Arg("status", "running")),
		})
		if err != nil {
			log.Errorf("ContainerList failed: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to list containers")
			return
		}
		writeJSON(w, list)
	})

	r.Get("/containers/{id}/inspect", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		info, _, err := cli.ContainerInspectWithRaw(r.Context(), id, false)
		if err != nil {
			writeError(w, http.StatusNotFound, "container not found")
			return
		}
		// Strip env vars to prevent leaking secrets from other containers
		if info.Config != nil {
			info.Config.Env = nil
		}
		writeJSON(w, info)
	})

	r.Get("/images/{name}/manifest", func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		dist, err := cli.DistributionInspect(r.Context(), name, "")
		if err != nil {
			log.Errorf("DistributionInspect(%s) failed: %v", name, err)
			writeError(w, http.StatusInternalServerError, "failed to inspect image")
			return
		}
		writeJSON(w, dist)
	})

	r.Get("/images/{id}/inspect", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		info, _, err := cli.ImageInspectWithRaw(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusNotFound, "image not found")
			return
		}
		writeJSON(w, info)
	})

	log.Infof("Agent listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

// authMiddleware validates the Bearer token and logs failures.
func authMiddleware(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			provided := strings.TrimPrefix(auth, "Bearer ")
			if !strings.HasPrefix(auth, "Bearer ") || provided != token {
				ip, _, _ := net.SplitHostPort(r.RemoteAddr)
				log.Warnf("Unauthorized request from %s: %s %s", ip, r.Method, r.URL.Path)
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// rateLimiter is a simple per-IP sliding-window counter (no external deps).
// maxReqs requests are allowed per window duration per IP.
func rateLimiter(maxReqs int, window time.Duration) func(http.Handler) http.Handler {
	type entry struct {
		count    int
		windowAt time.Time
		lastSeen time.Time
	}
	var mu sync.Mutex
	counters := make(map[string]*entry)

	go func() {
		for range time.Tick(time.Minute) {
			mu.Lock()
			for ip, e := range counters {
				if time.Since(e.lastSeen) > 5*time.Minute {
					delete(counters, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			now := time.Now()
			mu.Lock()
			e, ok := counters[ip]
			if !ok || now.Sub(e.windowAt) >= window {
				e = &entry{windowAt: now}
				counters[ip] = e
			}
			e.count++
			e.lastSeen = now
			over := e.count > maxReqs
			mu.Unlock()
			if over {
				writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
