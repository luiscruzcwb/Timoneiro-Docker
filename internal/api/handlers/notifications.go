package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/notifications"
	log "github.com/sirupsen/logrus"
)

// NotificationHandler handles notification channel CRUD and testing
type NotificationHandler struct {
	DB      *db.DB
	Manager *notifications.Manager
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	channels, err := h.DB.ListNotificationChannels()
	if err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to list notification channels")
		return
	}
	if channels == nil {
		channels = []db.NotificationChannel{}
	}
	writeJSON(w, channels)
}

func (h *NotificationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var nc db.NotificationChannel
	if err := json.NewDecoder(r.Body).Decode(&nc); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.DB.CreateNotificationChannel(&nc); err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to create notification channel")
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, nc)
}

func (h *NotificationHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var nc db.NotificationChannel
	if err := json.NewDecoder(r.Body).Decode(&nc); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	nc.ID = id
	if err := h.DB.UpdateNotificationChannel(&nc); err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to update notification channel")
		return
	}
	writeJSON(w, nc)
}

func (h *NotificationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.DB.DeleteNotificationChannel(id); err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to delete notification channel")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *NotificationHandler) Test(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	nc, err := h.DB.GetNotificationChannel(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "notification channel not found")
		return
	}
	if err := h.Manager.Test(nc); err != nil {
		log.Errorf("Notification test failed for channel %d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "notification test failed: "+err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "ok", "message": "test notification sent"})
}
