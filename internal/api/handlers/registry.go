package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/luiscruzcwb/timoneiro/internal/db"
)

type RegistryHandler struct {
	DB *db.DB
}

func (h *RegistryHandler) List(w http.ResponseWriter, r *http.Request) {
	regs, err := h.DB.ListRegistries()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list registries")
		return
	}
	if regs == nil {
		regs = []db.Registry{}
	}
	// Mask passwords in the response
	for i := range regs {
		if regs[i].Password != "" {
			regs[i].Password = "••••••••"
		}
	}
	writeJSON(w, regs)
}

func (h *RegistryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var reg db.Registry
	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	reg.Host = normalizeHost(reg.Type, reg.Host)
	if err := h.DB.CreateRegistry(&reg); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create registry")
		return
	}
	reg.Password = "••••••••"
	writeJSON(w, reg)
}

func (h *RegistryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var reg db.Registry
	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	reg.ID = id
	reg.Host = normalizeHost(reg.Type, reg.Host)
	// If client sends masked password, keep existing
	if reg.Password == "••••••••" {
		existing, err := h.DB.GetRegistryByHost(reg.Host)
		if err == nil && existing != nil {
			reg.Password = existing.Password
		}
	}
	if err := h.DB.UpdateRegistry(&reg); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update registry")
		return
	}
	reg.Password = "••••••••"
	writeJSON(w, reg)
}

func (h *RegistryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.DB.DeleteRegistry(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete registry")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RegistryHandler) Test(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Host     string `json:"host"`
		Type     string `json:"type"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	host := normalizeHost(req.Type, req.Host)
	ok, msg := testRegistryAuth(host, req.Username, req.Password)
	writeJSON(w, map[string]interface{}{"ok": ok, "message": msg})
}

func normalizeHost(regType, host string) string {
	switch regType {
	case "dockerhub":
		return "index.docker.io"
	case "ghcr":
		return "ghcr.io"
	default:
		// strip protocol if user pastes a full URL
		host = strings.TrimPrefix(host, "https://")
		host = strings.TrimPrefix(host, "http://")
		return strings.TrimRight(host, "/")
	}
}

func testRegistryAuth(host, username, password string) (bool, string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	registryURL := fmt.Sprintf("https://%s/v2/", host)
	client := &http.Client{}

	req, err := http.NewRequestWithContext(ctx, "GET", registryURL, nil)
	if err != nil {
		return false, fmt.Sprintf("invalid host: %v", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Sprintf("cannot reach registry: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, "Registry reached (public access)"
	}

	if resp.StatusCode != http.StatusUnauthorized {
		return false, fmt.Sprintf("unexpected response: %s", resp.Status)
	}

	// Registry requires auth — try with credentials
	challenge := resp.Header.Get("WWW-Authenticate")
	lower := strings.ToLower(challenge)

	if strings.HasPrefix(lower, "bearer") {
		if err := fetchBearerToken(ctx, challenge, username, password); err != nil {
			return false, fmt.Sprintf("authentication failed: %v", err)
		}
		return true, "Credentials valid"
	}

	// Basic auth fallback
	req2, _ := http.NewRequestWithContext(ctx, "GET", registryURL, nil)
	req2.SetBasicAuth(username, password)
	resp2, err := client.Do(req2)
	if err != nil {
		return false, err.Error()
	}
	defer resp2.Body.Close()
	if resp2.StatusCode == http.StatusOK {
		return true, "Credentials valid"
	}
	return false, fmt.Sprintf("authentication failed: %s", resp2.Status)
}

func fetchBearerToken(ctx context.Context, challenge, username, password string) error {
	lower := strings.ToLower(challenge)
	raw := strings.TrimPrefix(lower, "bearer ")

	pairs := strings.Split(raw, ",")
	values := make(map[string]string)
	for _, pair := range pairs {
		pair = strings.TrimSpace(pair)
		if k, v, ok := strings.Cut(pair, "="); ok {
			values[k] = strings.Trim(v, `"`)
		}
	}

	realm := values["realm"]
	if realm == "" {
		return errors.New("no realm in challenge")
	}

	u, err := url.Parse(realm)
	if err != nil {
		return err
	}
	q := u.Query()
	if svc := values["service"]; svc != "" {
		q.Set("service", svc)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return err
	}
	if username != "" {
		req.SetBasicAuth(username, password)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("token service returned %s", resp.Status)
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.Token == "" {
		return errors.New("no token in response")
	}
	return nil
}
