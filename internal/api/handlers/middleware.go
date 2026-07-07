package handlers

import (
	"context"
	"net/http"

	"github.com/luiscruzcwb/timoneiro/internal/db"
)

type contextKey string

const userContextKey contextKey = "user"

func UserFromContext(ctx context.Context) (*db.User, bool) {
	u, ok := ctx.Value(userContextKey).(*db.User)
	return u, ok
}

// RequireAuth validates the session cookie and attaches the current user to the request context.
// Responds 401 for missing/invalid/expired sessions.
func RequireAuth(database *db.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(SessionCookieName)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "not authenticated")
				return
			}
			session, err := database.GetSession(cookie.Value)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "session expired")
				return
			}
			user, err := database.GetUserByID(session.UserID)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "not authenticated")
				return
			}
			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
