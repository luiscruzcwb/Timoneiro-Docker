package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/client"
	"github.com/go-chi/chi/v5"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	log "github.com/sirupsen/logrus"
)

// EnvironmentHandler handles environment CRUD
type EnvironmentHandler struct {
	DB *db.DB
}

func (h *EnvironmentHandler) List(w http.ResponseWriter, r *http.Request) {
	envs, err := h.DB.ListEnvironments()
	if err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to list environments")
		return
	}
	if envs == nil {
		envs = []db.Environment{}
	}
	writeJSON(w, envs)
}

func (h *EnvironmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var env db.Environment
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.DB.CreateEnvironment(&env); err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to create environment")
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, env)
}

func (h *EnvironmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var env db.Environment
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	env.ID = id
	if err := h.DB.UpdateEnvironment(&env); err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to update environment")
		return
	}
	writeJSON(w, env)
}

func (h *EnvironmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.DB.DeleteEnvironment(id); err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to delete environment")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *EnvironmentHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Host  string `json:"host"`
		Type  string `json:"type"`
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Host == "" {
		writeError(w, http.StatusBadRequest, "host is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if body.Type == "agent" {
		url := strings.TrimRight(body.Host, "/") + "/health"
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			writeJSON(w, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		if body.Token != "" {
			req.Header.Set("Authorization", "Bearer "+body.Token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			writeJSON(w, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			writeJSON(w, map[string]interface{}{"ok": false, "error": "agent returned " + resp.Status})
			return
		}
		var health map[string]string
		json.NewDecoder(resp.Body).Decode(&health)
		writeJSON(w, map[string]interface{}{
			"ok":         true,
			"host":       body.Host,
			"apiVersion": health["docker"],
		})
		return
	}

	cli, err := client.NewClientWithOpts(
		client.WithHost(body.Host),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		writeJSON(w, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}
	defer cli.Close()

	ping, err := cli.Ping(ctx)
	if err != nil {
		writeJSON(w, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	writeJSON(w, map[string]interface{}{
		"ok":         true,
		"host":       body.Host,
		"apiVersion": ping.APIVersion,
	})
}

func (h *EnvironmentHandler) ListContainers(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	containers, err := h.DB.ListContainers(id)
	if err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to list containers")
		return
	}
	if containers == nil {
		containers = []db.ContainerRecord{}
	}
	writeJSON(w, containers)
}
