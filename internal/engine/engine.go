package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/luiscruzcwb/timoneiro/internal/api/ws"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/notifications"
	"github.com/luiscruzcwb/timoneiro/pkg/container"
	"github.com/luiscruzcwb/timoneiro/pkg/filters"
	"github.com/luiscruzcwb/timoneiro/pkg/registry"
	t "github.com/luiscruzcwb/timoneiro/pkg/types"
	log "github.com/sirupsen/logrus"
)

// Engine is the core monitoring loop
type Engine struct {
	DB            *db.DB
	Hub           *ws.Hub
	Notifications *notifications.Manager
	Interval      time.Duration

	clients map[int64]container.Client
	mu      sync.RWMutex
	stop    chan struct{}

	// previousImages stores the previous image ID per container for rollback
	previousImages map[string]string
}

// New creates a new Engine
func New(database *db.DB, hub *ws.Hub, nm *notifications.Manager, interval time.Duration) *Engine {
	return &Engine{
		DB:             database,
		Hub:            hub,
		Notifications:  nm,
		Interval:       interval,
		clients:        make(map[int64]container.Client),
		stop:           make(chan struct{}),
		previousImages: make(map[string]string),
	}
}

// Start begins the monitoring loop
func (e *Engine) Start() {
	log.Infof("Engine starting, check interval: %s", e.Interval)
	registry.DBCredentialsLookup = func(host string) (string, string, bool) {
		reg, err := e.DB.GetRegistryByHost(host)
		if err != nil || reg == nil {
			return "", "", false
		}
		return reg.Username, reg.Password, true
	}
	go e.loop()
	go e.schedulerLoop()
}

// Stop halts the monitoring loop
func (e *Engine) Stop() {
	close(e.stop)
}

func (e *Engine) loop() {
	e.runCheck()
	ticker := time.NewTicker(e.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			e.runCheck()
		case <-e.stop:
			return
		}
	}
}

// TriggerCheck runs an immediate check cycle outside the normal interval
func (e *Engine) TriggerCheck() {
	go e.runCheck()
}

// schedulerLoop checks every minute whether pending updates should be applied within a maintenance window
func (e *Engine) schedulerLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			e.runScheduledUpdates()
		case <-e.stop:
			return
		}
	}
}

func (e *Engine) runScheduledUpdates() {
	policy, err := e.DB.GetPolicySettings()
	if err != nil || policy.UpdateMode != "scheduled" {
		return
	}
	if !isInAnyMaintenanceWindow(policy.MaintenanceWindows) {
		return
	}
	pending, err := e.DB.ListPendingUpdates("pending", 0)
	if err != nil || len(pending) == 0 {
		return
	}
	log.Infof("Scheduler: applying %d pending updates within maintenance window", len(pending))
	for i := range pending {
		u := pending[i]
		mode := e.effectiveModeFromPolicy(policy, u.ContainerID, nil)
		if mode == "scheduled" || mode == "automatic" {
			go e.autoApprove(&u)
		}
	}
}

func isInAnyMaintenanceWindow(windows []db.MaintenanceWindow) bool {
	now := time.Now()
	dayOfWeek := int(now.Weekday())
	currentTime := now.Format("15:04")
	for _, w := range windows {
		if !w.Enabled {
			continue
		}
		inDay := false
		for _, d := range w.Days {
			if d == dayOfWeek {
				inDay = true
				break
			}
		}
		if !inDay {
			continue
		}
		if currentTime >= w.StartTime && currentTime < w.EndTime {
			return true
		}
	}
	return false
}

// autoApprove transitions a pending update: pending → deploying → deployed/failed
func (e *Engine) autoApprove(u *db.PendingUpdate) {
	if err := e.DB.UpdatePendingUpdateStatus(u.ID, "deploying"); err != nil {
		return
	}
	if err := e.UpdateContainer(u.ContainerID, false); err != nil {
		log.Errorf("Auto-update failed for %s: %v", u.ContainerName, err)
		_ = e.DB.UpdatePendingUpdateStatus(u.ID, "failed")
		return
	}
	_ = e.DB.UpdatePendingUpdateStatus(u.ID, "deployed")
}

// effectiveModeFromPolicy returns the update mode for a container, checking exceptions first
func (e *Engine) effectiveModeFromPolicy(policy db.PolicySettings, containerID string, labels map[string]string) string {
	for _, ex := range policy.ContainerExceptions {
		if ex.ContainerID == containerID {
			return ex.Mode
		}
	}
	if labels != nil {
		if stackName, ok := labels["com.docker.compose.project"]; ok && stackName != "" {
			for _, ex := range policy.StackExceptions {
				if ex.StackName == stackName {
					return ex.Mode
				}
			}
		}
	}
	return policy.UpdateMode
}

func (e *Engine) runCheck() {
	envs, err := e.DB.ListEnvironments()
	if err != nil {
		log.Errorf("Engine: failed to list environments: %v", err)
		return
	}
	var summaries []notifications.CheckSummary
	for _, env := range envs {
		summary := e.checkEnvironment(env)
		if len(summary.Containers) > 0 {
			summaries = append(summaries, summary)
		}
	}
	if len(summaries) > 0 {
		go e.Notifications.NotifyCheckSummary(summaries)
	}
}

func (e *Engine) getClient(env db.Environment) (container.Client, error) {
	e.mu.RLock()
	if cli, ok := e.clients[env.ID]; ok {
		e.mu.RUnlock()
		return cli, nil
	}
	e.mu.RUnlock()

	e.mu.Lock()
	defer e.mu.Unlock()

	cli, err := container.NewClientWithHost(env.Host, container.ClientOptions{
		WarnOnHeadFailed: container.WarnAuto,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to docker host %q: %w", env.Host, err)
	}
	e.clients[env.ID] = cli
	return cli, nil
}

// agentContainer mirrors the Docker SDK types.Container JSON fields we need
type agentContainer struct {
	ID      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Image   string            `json:"Image"`
	ImageID string            `json:"ImageID"`
	Labels  map[string]string `json:"Labels"`
}

func (e *Engine) checkAgentEnvironment(env db.Environment) {
	base := strings.TrimRight(env.Host, "/")

	doGet := func(path string, v interface{}) error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
		if err != nil {
			return err
		}
		if env.Token != "" {
			req.Header.Set("Authorization", "Bearer "+env.Token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("agent returned %s", resp.Status)
		}
		return json.NewDecoder(resp.Body).Decode(v)
	}

	var list []agentContainer
	if err := doGet("/containers", &list); err != nil {
		log.Errorf("Engine[%s]: agent list failed: %v", env.Name, err)
		return
	}

	activeIDs := make([]string, 0, len(list))
	for _, c := range list {
		name := c.ID[:12]
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		activeIDs = append(activeIDs, c.ID)

		record := &db.ContainerRecord{
			ID:            c.ID,
			EnvironmentID: env.ID,
			Name:          name,
			Image:         c.Image,
			Status:        "unknown",
			CurrentDigest: c.ImageID,
			LastChecked:   time.Now(),
		}
		if err := e.DB.UpsertContainer(record); err != nil {
			log.Errorf("Engine[%s]: upsert %s failed: %v", env.Name, name, err)
		}

		e.Hub.Publish(ws.EventContainerStatusChanged, map[string]interface{}{
			"containerId":   c.ID,
			"containerName": name,
			"status":        record.Status,
			"environmentId": env.ID,
		})
	}

	if err := e.DB.DeleteStaleContainers(env.ID, activeIDs); err != nil {
		log.Errorf("Engine[%s]: failed to clean stale containers: %v", env.Name, err)
	}
}

func (e *Engine) checkEnvironment(env db.Environment) notifications.CheckSummary {
	summary := notifications.CheckSummary{EnvironmentName: env.Name}
	if env.Type == "agent" {
		e.checkAgentEnvironment(env)
		return summary
	}

	cli, err := e.getClient(env)
	if err != nil {
		log.Errorf("Engine[%s]: %v", env.Name, err)
		return summary
	}

	filter, _ := filters.BuildFilter(nil, nil, false, "")
	params := t.UpdateParams{
		Filter:  filter,
		Cleanup: false,
		Timeout: 30 * time.Second,
	}

	containers, err := cli.ListContainers(params.Filter)
	if err != nil {
		log.Errorf("Engine[%s]: failed to list containers: %v", env.Name, err)
		return summary
	}

	for _, c := range containers {
		// Always register the container first so it appears in the dashboard
		// even if the stale check fails (e.g. local images without a registry).
		record := &db.ContainerRecord{
			ID:            string(c.ID()),
			EnvironmentID: env.ID,
			Name:          c.Name(),
			Image:         c.ImageName(),
			Status:        "unknown",
			CurrentDigest: string(c.SafeImageID()),
			LastChecked:   time.Now(),
		}
		if err := e.DB.UpsertContainer(record); err != nil {
			log.Errorf("Engine[%s]: failed to upsert container %s: %v", env.Name, c.Name(), err)
		}

		stale, newImageID, err := cli.IsContainerStale(c, params)
		if err != nil {
			if isLocalImageError(err) {
				log.Debugf("Engine[%s]: %s has no remote registry — marking as local", env.Name, c.Name())
				record.Status = "local"
			} else {
				log.Errorf("Engine[%s]: stale check failed for %s: %v", env.Name, c.Name(), err)
				record.Status = "failed"
			}
			if err := e.DB.UpsertContainer(record); err != nil {
				log.Errorf("Engine[%s]: failed to update container status %s: %v", env.Name, c.Name(), err)
			}
			summary.Containers = append(summary.Containers, notifications.ContainerResult{
				Name: c.Name(), Image: c.ImageName(), Status: record.Status,
			})
			continue
		}

		status := "up_to_date"
		latestDigest := ""
		if stale {
			status = "update_available"
			latestDigest = string(newImageID)
		}

		record.Status = status
		record.LatestDigest = latestDigest
		if err := e.DB.UpsertContainer(record); err != nil {
			log.Errorf("Engine[%s]: failed to update container status %s: %v", env.Name, c.Name(), err)
		}
		summary.Containers = append(summary.Containers, notifications.ContainerResult{
			Name: c.Name(), Image: c.ImageName(), Status: status,
		})

		if stale {
			labels := map[string]string{}
			if info := c.ContainerInfo(); info != nil && info.Config != nil {
				labels = info.Config.Labels
			}
			policy, _ := e.DB.GetPolicySettings()
			mode := e.effectiveModeFromPolicy(policy, string(c.ID()), labels)

			if mode == "skip" {
				continue
			}

			pending := &db.PendingUpdate{
				ContainerID:   string(c.ID()),
				ContainerName: c.Name(),
				EnvironmentID: env.ID,
				CurrentImage:  c.ImageName(),
				LatestImage:   c.ImageName(),
				CurrentDigest: string(c.SafeImageID()),
				LatestDigest:  string(newImageID),
			}
			if err := e.DB.UpsertPendingUpdate(pending); err != nil {
				log.Errorf("Engine[%s]: failed to create pending update: %v", env.Name, err)
			} else {
				go e.scanCVE(pending.ID, c.ImageName())
				if mode == "automatic" {
					go e.autoApprove(pending)
				}
			}
		}

		e.Hub.Publish(ws.EventContainerStatusChanged, map[string]interface{}{
			"containerId":   string(c.ID()),
			"containerName": c.Name(),
			"status":        status,
			"environmentId": env.ID,
		})
	}

	// Remove DB records for containers that are no longer running
	activeIDs := make([]string, 0, len(containers))
	for _, c := range containers {
		activeIDs = append(activeIDs, string(c.ID()))
	}
	if err := e.DB.DeleteStaleContainers(env.ID, activeIDs); err != nil {
		log.Errorf("Engine[%s]: failed to clean stale containers: %v", env.Name, err)
	}
	return summary
}

func (e *Engine) scanCVE(updateID int64, imageName string) {
	summary, err := ScanImage(imageName)
	if err != nil {
		log.Warnf("CVE scan failed for %s: %v", imageName, err)
		return
	}

	cveJSON, _ := json.Marshal(summary.Data)
	if err := e.DB.UpdatePendingUpdateCVE(updateID, summary.Critical, summary.High, summary.Medium, summary.Low, string(cveJSON)); err != nil {
		log.Errorf("Failed to store CVE data: %v", err)
		return
	}

	e.Hub.Publish(ws.EventCVEScanCompleted, map[string]interface{}{
		"updateId":    updateID,
		"cveCritical": summary.Critical,
		"cveHigh":     summary.High,
		"cveMedium":   summary.Medium,
		"cveLow":      summary.Low,
	})
}

// UpdateContainer triggers an immediate update for a specific container.
// notify=true sends an immediate per-event notification (manual triggers from UI).
// notify=false suppresses it — used for automatic updates covered by the batch summary.
func (e *Engine) UpdateContainer(containerID string, notify bool) error {
	envs, err := e.DB.ListEnvironments()
	if err != nil {
		return err
	}

	// Fetch pending update now so we have metadata regardless of what happens below
	pendingUpdate, _ := e.DB.GetPendingUpdateByContainerID(containerID)

	for _, env := range envs {
		// Agent environments don't expose a Docker API; skip them here
		if env.Type == "agent" {
			continue
		}
		cli, err := e.getClient(env)
		if err != nil {
			log.Warnf("UpdateContainer: cannot get client for env %q: %v", env.Name, err)
			continue
		}
		c, err := cli.GetContainer(t.ContainerID(containerID))
		if err != nil {
			log.Warnf("UpdateContainer: container %s not found in env %q: %v", containerID[:12], env.Name, err)
			continue
		}

		e.mu.Lock()
		e.previousImages[containerID] = string(c.SafeImageID())
		e.mu.Unlock()

		e.Hub.Publish(ws.EventUpdateStarted, map[string]string{
			"containerId":   containerID,
			"containerName": c.Name(),
		})

		_ = e.DB.UpdateContainerStatus(containerID, "updating")

		start := time.Now()
		params := t.UpdateParams{
			Filter:  func(t.FilterableContainer) bool { return true },
			Cleanup: true,
			Timeout: 60 * time.Second,
		}

		oldImage := c.ImageName()
		newContainerID, err := performUpdate(cli, c, params)
		duration := time.Since(start).Milliseconds()

		newImage := oldImage
		if pendingUpdate != nil && pendingUpdate.LatestImage != "" && pendingUpdate.LatestImage != oldImage {
			newImage = pendingUpdate.LatestImage
		}

		history := &db.UpdateHistory{
			ContainerID:   containerID,
			ContainerName: c.Name(),
			EnvironmentID: env.ID,
			OldImage:      oldImage,
			NewImage:      newImage,
			Duration:      duration,
		}

		if err != nil {
			history.Status = "failed"
			history.Error = err.Error()
			_ = e.DB.UpdateContainerStatus(containerID, "failed")
			e.Hub.Publish(ws.EventUpdateFailed, map[string]string{
				"containerId": containerID,
				"error":       err.Error(),
			})
		} else {
			history.Status = "success"
			_ = e.DB.UpdateContainerStatus(containerID, "up_to_date")
			// Register the new container ID immediately so last_updated is set
			// before the next check cycle discovers and upserts it without a timestamp.
			if newContainerID != "" && string(newContainerID) != containerID {
				now := time.Now()
				_ = e.DB.UpsertContainer(&db.ContainerRecord{
					ID:            string(newContainerID),
					EnvironmentID: env.ID,
					Name:          c.Name(),
					Image:         c.ImageName(),
					Status:        "up_to_date",
					CurrentDigest: string(c.SafeImageID()),
					LastChecked:   now,
					LastUpdated:   now,
				})
			}
			e.Hub.Publish(ws.EventUpdateCompleted, map[string]string{
				"containerId": containerID,
			})
		}

		if err := e.DB.AddHistory(history); err != nil {
			log.Errorf("UpdateContainer: failed to record history for %s: %v", containerID, err)
		}
		if notify {
			e.Notifications.NotifyUpdate(history)
		}
		return err
	}

	// Container not found in any environment — record a failed attempt so the Audit isn't empty
	notFoundErr := fmt.Errorf("container %s not found in any environment", containerID)
	if pendingUpdate != nil {
		history := &db.UpdateHistory{
			ContainerID:   containerID,
			ContainerName: pendingUpdate.ContainerName,
			EnvironmentID: pendingUpdate.EnvironmentID,
			OldImage:      pendingUpdate.CurrentImage,
			NewImage:      pendingUpdate.CurrentImage,
			Status:        "failed",
			Error:         notFoundErr.Error(),
		}
		if err := e.DB.AddHistory(history); err != nil {
			log.Errorf("UpdateContainer: failed to record not-found history for %s: %v", containerID, err)
		}
		e.Hub.Publish(ws.EventUpdateFailed, map[string]string{
			"containerId": containerID,
			"error":       notFoundErr.Error(),
		})
	}
	return notFoundErr
}

// RollbackContainer reverts a container to its previous image
func (e *Engine) RollbackContainer(containerID string) error {
	e.mu.RLock()
	prevImage, ok := e.previousImages[containerID]
	e.mu.RUnlock()

	if !ok || prevImage == "" {
		h, err := e.DB.GetLastSuccessfulUpdate(containerID)
		if err != nil {
			return fmt.Errorf("no previous image for container %s: %w", containerID, err)
		}
		prevImage = h.OldImage
	}

	log.Infof("Rolling back container %s to image %s", containerID, prevImage)

	envs, err := e.DB.ListEnvironments()
	if err != nil {
		return err
	}

	for _, env := range envs {
		cli, err := e.getClient(env)
		if err != nil {
			continue
		}
		c, err := cli.GetContainer(t.ContainerID(containerID))
		if err != nil {
			continue
		}

		e.Hub.Publish(ws.EventUpdateStarted, map[string]string{
			"containerId":   containerID,
			"containerName": c.Name(),
			"type":          "rollback",
		})

		start := time.Now()
		params := t.UpdateParams{
			Filter:  func(t.FilterableContainer) bool { return true },
			Timeout: 60 * time.Second,
		}

		currentImage := c.ImageName()
		rollbackErr := performRollback(cli, c, prevImage, params)
		duration := time.Since(start).Milliseconds()

		history := &db.UpdateHistory{
			ContainerID:   containerID,
			ContainerName: c.Name(),
			EnvironmentID: env.ID,
			OldImage:      currentImage,
			NewImage:      prevImage,
			Duration:      duration,
		}

		if rollbackErr != nil {
			history.Status = "failed"
			history.Error = rollbackErr.Error()
			_ = e.DB.UpdateContainerStatus(containerID, "failed")
			e.Hub.Publish(ws.EventUpdateFailed, map[string]string{
				"containerId": containerID,
				"error":       rollbackErr.Error(),
			})
		} else {
			history.Status = "rolled_back"
			_ = e.DB.UpdateContainerStatus(containerID, "up_to_date")
			e.Hub.Publish(ws.EventUpdateCompleted, map[string]string{
				"containerId": containerID,
				"type":        "rollback",
			})
		}

		_ = e.DB.AddHistory(history)
		e.Notifications.NotifyUpdate(history)
		return rollbackErr
	}

	return fmt.Errorf("container %s not found", containerID)
}

// isLocalImageError returns true when the registry error indicates the image has
// no remote counterpart (locally built, never pushed), as opposed to a real
// infrastructure failure (network timeout, bad credentials, etc.).
func isLocalImageError(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "repository does not exist") ||
		strings.Contains(msg, "manifest unknown") ||
		strings.Contains(msg, "no such manifest") ||
		strings.Contains(msg, "name unknown") ||
		strings.Contains(msg, "not found in registry")
}
