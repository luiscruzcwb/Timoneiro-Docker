package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/luiscruzcwb/timoneiro/internal/db"
	"golang.org/x/crypto/bcrypt"
)

const (
	SessionCookieName = "timoneiro_session"
	sessionTTL        = 7 * 24 * time.Hour
)

type AuthHandler struct {
	DB *db.DB
}

type credentialsBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Status reports whether the first-run admin account still needs to be created
func (h *AuthHandler) Status(w http.ResponseWriter, r *http.Request) {
	count, err := h.DB.CountUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check setup status")
		return
	}
	writeJSON(w, map[string]bool{"needsSetup": count == 0})
}

// Setup creates the single admin account. Only allowed while no user exists.
func (h *AuthHandler) Setup(w http.ResponseWriter, r *http.Request) {
	count, err := h.DB.CountUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check setup status")
		return
	}
	if count > 0 {
		writeError(w, http.StatusForbidden, "admin account already configured")
		return
	}

	var body credentialsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	if body.Username == "" || len(body.Password) < 8 {
		writeError(w, http.StatusBadRequest, "usuário obrigatório e senha deve ter ao menos 8 caracteres")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	user, err := h.DB.CreateUser(body.Username, string(hash))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create admin account")
		return
	}

	if err := h.startSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	writeJSON(w, map[string]string{"username": user.Username})
}

// Login authenticates against the admin account
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body credentialsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	user, err := h.DB.GetUserByUsername(strings.TrimSpace(body.Username))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "usuário ou senha inválidos")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "usuário ou senha inválidos")
		return
	}

	if err := h.startSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	writeJSON(w, map[string]string{"username": user.Username})
}

// Logout clears the current session
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(SessionCookieName); err == nil {
		_ = h.DB.DeleteSession(c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSON(w, map[string]string{"status": "ok"})
}

// Me returns the currently authenticated user
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, map[string]string{"username": user.Username})
}

type changePasswordBody struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body changePasswordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		writeError(w, http.StatusUnauthorized, "senha atual incorreta")
		return
	}
	if len(body.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "a nova senha deve ter ao menos 8 caracteres")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	if err := h.DB.UpdateUserPassword(user.ID, string(hash)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update password")
		return
	}
	// Invalidate all sessions (including the current one) — force a fresh login
	_ = h.DB.DeleteSessionsForUser(user.ID)
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSON(w, map[string]string{"status": "ok"})
}

func (h *AuthHandler) startSession(w http.ResponseWriter, r *http.Request, userID int64) error {
	token, err := generateToken()
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(sessionTTL)
	if err := h.DB.CreateSession(userID, token, expiresAt); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecure(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
	})
	return nil
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// isSecure reports whether the request arrived over HTTPS, either directly or
// terminated at a reverse proxy that sets X-Forwarded-Proto.
func isSecure(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
