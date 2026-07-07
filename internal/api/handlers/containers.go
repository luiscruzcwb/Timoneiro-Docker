package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/engine"
	log "github.com/sirupsen/logrus"
)

// ContainerHandler handles container operations
type ContainerHandler struct {
	DB     *db.DB
	Engine *engine.Engine
}

func (h *ContainerHandler) List(w http.ResponseWriter, r *http.Request) {
	containers, err := h.DB.ListContainers(0)
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

func (h *ContainerHandler) TriggerUpdate(w http.ResponseWriter, r *http.Request) {
	containerID := chi.URLParam(r, "id")
	if containerID == "" {
		writeError(w, http.StatusBadRequest, "container id required")
		return
	}
	go func() {
		if err := h.Engine.UpdateContainer(containerID, true); err != nil {
			log.Errorf("Manual update failed for container %s: %v", containerID, err)
		}
	}()
	writeJSON(w, map[string]string{"status": "update triggered", "containerId": containerID})
}

func (h *ContainerHandler) TriggerCheck(w http.ResponseWriter, r *http.Request) {
	h.Engine.TriggerCheck()
	writeJSON(w, map[string]string{"status": "check triggered"})
}

func (h *ContainerHandler) Rollback(w http.ResponseWriter, r *http.Request) {
	containerID := chi.URLParam(r, "id")
	if containerID == "" {
		writeError(w, http.StatusBadRequest, "container id required")
		return
	}
	go func() {
		if err := h.Engine.RollbackContainer(containerID); err != nil {
			log.Errorf("Rollback failed for container %s: %v", containerID, err)
		}
	}()
	writeJSON(w, map[string]string{"status": "rollback triggered", "containerId": containerID})
}

func (h *ContainerHandler) UpdateTags(w http.ResponseWriter, r *http.Request) {
	containerID := chi.URLParam(r, "id")
	if containerID == "" {
		writeError(w, http.StatusBadRequest, "container id required")
		return
	}
	var body struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	tagsJSON, _ := json.Marshal(body.Tags)
	if err := h.DB.UpdateContainerTags(containerID, string(tagsJSON)); err != nil {
		log.Errorf("Failed to update tags for container %s: %v", containerID, err)
		writeError(w, http.StatusInternalServerError, "failed to update tags")
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}
