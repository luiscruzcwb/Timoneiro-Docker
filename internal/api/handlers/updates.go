package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/engine"
	log "github.com/sirupsen/logrus"
)

type UpdateHandler struct {
	DB     *db.DB
	Engine *engine.Engine
}

func (h *UpdateHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	envIDStr := r.URL.Query().Get("environmentId")
	var envID int64
	if envIDStr != "" {
		envID, _ = strconv.ParseInt(envIDStr, 10, 64)
	}

	updates, err := h.DB.ListPendingUpdates(status, envID)
	if err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to list updates")
		return
	}
	if updates == nil {
		updates = []db.PendingUpdate{}
	}
	writeJSON(w, updates)
}

func (h *UpdateHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	update, err := h.DB.GetPendingUpdate(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "update not found")
		return
	}

	if update.Status != "pending" {
		writeError(w, http.StatusBadRequest, "update is not in pending state")
		return
	}

	if err := h.DB.UpdatePendingUpdateStatus(id, "approved"); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve update")
		return
	}

	go func() {
		if err := h.DB.UpdatePendingUpdateStatus(id, "deploying"); err != nil {
			return
		}
		if err := h.Engine.UpdateContainer(update.ContainerID, true); err != nil {
			log.Errorf("Deployment failed for update %d: %v", id, err)
			_ = h.DB.UpdatePendingUpdateStatus(id, "failed")
			return
		}
		_ = h.DB.UpdatePendingUpdateStatus(id, "deployed")
	}()

	writeJSON(w, map[string]interface{}{"status": "approved", "id": id})
}

func (h *UpdateHandler) PatchNotes(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.DB.UpdatePendingUpdateNotes(id, body.Notes); err != nil {
		log.Errorf("PatchNotes: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save notes")
		return
	}
	writeJSON(w, map[string]interface{}{"status": "ok", "id": id})
}

func (h *UpdateHandler) Ignore(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.DB.UpdatePendingUpdateStatus(id, "ignored"); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ignore update")
		return
	}
	writeJSON(w, map[string]interface{}{"status": "ignored", "id": id})
}
