package handlers

import (
	"net/http"
	"strconv"

	"github.com/luiscruzcwb/timoneiro/internal/db"
	log "github.com/sirupsen/logrus"
)

// HistoryHandler serves update history
type HistoryHandler struct {
	DB *db.DB
}

func (h *HistoryHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0

	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	var environmentID int64
	if e := r.URL.Query().Get("environment"); e != "" {
		if v, err := strconv.ParseInt(e, 10, 64); err == nil {
			environmentID = v
		}
	}

	containerID := r.URL.Query().Get("container")

	history, err := h.DB.ListHistory(limit, offset, environmentID, containerID)
	if err != nil {
		log.Error(err)
		writeError(w, http.StatusInternalServerError, "failed to list history")
		return
	}
	if history == nil {
		history = []db.UpdateHistory{}
	}
	writeJSON(w, history)
}
