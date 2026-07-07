package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/luiscruzcwb/timoneiro/internal/db"
)

type SettingsHandler struct {
	DB *db.DB
}

func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	p, err := h.DB.GetPolicySettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get settings")
		return
	}
	writeJSON(w, p)
}

func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var p db.PolicySettings
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if p.UpdateMode != "automatic" && p.UpdateMode != "manual" && p.UpdateMode != "scheduled" {
		p.UpdateMode = "manual"
	}
	if p.ContainerExceptions == nil {
		p.ContainerExceptions = []db.ContainerException{}
	}
	if p.StackExceptions == nil {
		p.StackExceptions = []db.StackException{}
	}
	if p.MaintenanceWindows == nil {
		p.MaintenanceWindows = []db.MaintenanceWindow{}
	}
	if err := h.DB.SavePolicySettings(p); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	writeJSON(w, p)
}
