package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	dockercontainer "github.com/docker/docker/api/types/container"
	dockerimage "github.com/docker/docker/api/types/image"
	"github.com/luiscruzcwb/timoneiro/internal/api/ws"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/notifications"
	"github.com/luiscruzcwb/timoneiro/pkg/container"
	"github.com/luiscruzcwb/timoneiro/pkg/filters"
	"github.com/luiscruzcwb/timoneiro/pkg/registry"
	"github.com/luiscruzcwb/timoneiro/pkg/registry/digest"
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
		if isSelfContainer(t.ContainerID(u.ContainerID)) {
			// Same self-update hazard as checkEnvironment (see isSelfContainer):
			// the "scheduled" mode bypasses that guard entirely because it never
			// goes through checkEnvironment's mode downgrade, so it needs its own
			// check here before handing the pending update to autoApprove.
			log.Warnf("Scheduler: skipping self-update for %s — apply manually if needed", u.ContainerName)
			continue
		}
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

// isSelfContainer reports whether id refers to the container Timoneiro itself is
// running in. Docker sets a container's hostname to its own short ID unless a
// custom hostname is configured, so this works without any extra plumbing.
//
// This exists as a safety net independent of the "dev.timoneiro.enable=false"
// label: performUpdate() stops the target container in-process, and Timoneiro
// has no signal handler to survive being stopped. If Timoneiro is ever asked to
// update itself (label missing, exception misconfigured, manual click in the
// UI), StopContainer's SIGTERM kills the running process before StartContainer
// can recreate it, and "unless-stopped" won't revive a container that was
// deliberately stopped — Timoneiro stays down until someone notices and runs
// `docker start` by hand, which just repeats the loop. This is what happened on
// CT100: the deployed compose file omitted the label, the update policy was
// "automatic", and Timoneiro auto-approved an update against itself every
// cycle, self-terminating in a tight restart loop.
func isSelfContainer(id t.ContainerID) bool {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return false
	}
	return id.ShortID() == hostname || string(id) == hostname
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

func (e *Engine) checkAgentEnvironment(env db.Environment) notifications.CheckSummary {
	summary := notifications.CheckSummary{EnvironmentName: env.Name}
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
		return summary
	}

	activeIDs := make([]string, 0, len(list))
	for _, c := range list {
		name := c.ID[:12]
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		activeIDs = append(activeIDs, c.ID)

		// Register first so the container shows up on the dashboard even if
		// the digest check below fails (e.g. agent unreachable mid-cycle).
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

		status, labels := e.checkAgentContainerStatus(doGet, env, c.ID)
		record.Status = status
		if err := e.DB.UpsertContainer(record); err != nil {
			log.Errorf("Engine[%s]: failed to update container status %s: %v", env.Name, name, err)
		}
		summary.Containers = append(summary.Containers, notifications.ContainerResult{
			Name: name, Image: c.Image, Status: status,
		})

		if status == "update_available" {
			policy, _ := e.DB.GetPolicySettings()
			mode := e.effectiveModeFromPolicy(policy, c.ID, labels)
			if isSelfContainer(t.ContainerID(c.ID)) && mode == "automatic" {
				mode = "manual"
			}
			if mode != "skip" {
				// LatestDigest is left blank: unlike the local flow, this check only
				// does a registry HEAD comparison (no pull), so we know the current
				// digest is stale but not the new one.
				pending := &db.PendingUpdate{
					ContainerID:   c.ID,
					ContainerName: name,
					EnvironmentID: env.ID,
					CurrentImage:  c.Image,
					LatestImage:   c.Image,
					CurrentDigest: c.ImageID,
				}
				if err := e.DB.UpsertPendingUpdate(pending); err != nil {
					log.Errorf("Engine[%s]: failed to create pending update for %s: %v", env.Name, name, err)
				} else if pending.Status != "deploying" {
					// Skip if an attempt for this container is already in flight — the
					// next check cycle can land before a slow pull+recreate finishes,
					// and re-approving would fire a second, concurrent update.
					go e.scanCVE(pending.ID, c.Image)
					if mode == "automatic" {
						go e.autoApprove(pending)
					}
				}
			}
		}

		e.Hub.Publish(ws.EventContainerStatusChanged, map[string]interface{}{
			"containerId":   c.ID,
			"containerName": name,
			"status":        status,
			"environmentId": env.ID,
		})
	}

	if err := e.DB.DeleteStaleContainers(env.ID, activeIDs); err != nil {
		log.Errorf("Engine[%s]: failed to clean stale containers: %v", env.Name, err)
	}
	return summary
}

// checkAgentContainerStatus determines whether an agent-managed container is
// up to date by fetching its container/image inspect data through the agent's
// read-only HTTP API and comparing the current image's RepoDigests against the
// registry's manifest digest — the same HEAD-based comparison used for local
// containers, but sourced remotely since Timoneiro has no direct Docker access
// to agent-managed hosts.
func (e *Engine) checkAgentContainerStatus(doGet func(string, interface{}) error, env db.Environment, containerID string) (status string, labels map[string]string) {
	var containerInfo dockercontainer.InspectResponse
	if err := doGet("/containers/"+url.PathEscape(containerID)+"/inspect", &containerInfo); err != nil {
		log.Debugf("Engine[%s]: agent container inspect failed for %s: %v", env.Name, containerID, err)
		return "unknown", nil
	}
	if containerInfo.Config != nil {
		labels = containerInfo.Config.Labels
	}

	var imageInfo dockerimage.InspectResponse
	if err := doGet("/images/"+url.PathEscape(containerInfo.Image)+"/inspect", &imageInfo); err != nil {
		log.Debugf("Engine[%s]: agent image inspect failed for %s: %v", env.Name, containerID, err)
		return "unknown", labels
	}

	c := container.NewContainer(&containerInfo, &imageInfo)

	opts, err := registry.GetPullOptions(c.ImageName())
	if err != nil {
		log.Debugf("Engine[%s]: failed to resolve pull options for %s: %v", env.Name, c.ImageName(), err)
		return "unknown", labels
	}

	match, err := digest.CompareDigest(c, opts.RegistryAuth)
	if err != nil {
		if isLocalImageError(err) {
			return "local", labels
		}
		log.Debugf("Engine[%s]: digest compare failed for %s: %v", env.Name, c.ImageName(), err)
		return "unknown", labels
	}
	if match {
		return "up_to_date", labels
	}
	return "update_available", labels
}

func (e *Engine) checkEnvironment(env db.Environment) notifications.CheckSummary {
	if env.Type == "agent" {
		return e.checkAgentEnvironment(env)
	}
	summary := notifications.CheckSummary{EnvironmentName: env.Name}

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
			self := isSelfContainer(c.ID())
			if self && mode == "automatic" {
				// Never auto-apply an update to the container we're running in — see
				// isSelfContainer for why that self-terminates without recovering.
				// Still record it as a pending update below so it's visible in the
				// dashboard; the operator must apply it from outside (redeploy via
				// compose) or via an explicit manual approval.
				log.Warnf("Engine[%s]: %s is Timoneiro's own container — skipping automatic self-update", env.Name, c.Name())
				mode = "manual"
			}

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
			} else if pending.Status != "deploying" {
				// Skip if an attempt for this container is already in flight — the
				// next check cycle can land before a slow pull+recreate finishes,
				// and re-approving would fire a second, concurrent update.
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
	// Fetch pending update now so we have metadata regardless of what happens below
	pendingUpdate, _ := e.DB.GetPendingUpdateByContainerID(containerID)

	if record, err := e.DB.GetContainerByID(containerID); err == nil {
		if env, envErr := e.DB.GetEnvironment(record.EnvironmentID); envErr == nil && env.Type == "agent" {
			return e.updateAgentContainer(*env, record, pendingUpdate, notify)
		}
	}

	envs, err := e.DB.ListEnvironments()
	if err != nil {
		return err
	}

	for _, env := range envs {
		// Agent environments are handled above via updateAgentContainer
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
		newContainerID, err := container.PerformUpdate(cli, c, params)
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

// callAgent issues an authenticated HTTP request to an agent-managed environment.
// If v is non-nil, a successful JSON response is decoded into it.
func callAgent(env db.Environment, method, path string, timeout time.Duration, v interface{}) error {
	base := strings.TrimRight(env.Host, "/")
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, base+path, nil)
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
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("agent returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	if v == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// updateAgentContainer applies an update to a container running on an agent-managed
// host. Timoneiro has no direct Docker connection to these hosts, so the actual
// pull+recreate is delegated to the agent's own local Docker access via its
// POST /containers/{id}/update endpoint.
func (e *Engine) updateAgentContainer(env db.Environment, record *db.ContainerRecord, pendingUpdate *db.PendingUpdate, notify bool) error {
	e.Hub.Publish(ws.EventUpdateStarted, map[string]string{
		"containerId":   record.ID,
		"containerName": record.Name,
	})
	_ = e.DB.UpdateContainerStatus(record.ID, "updating")

	start := time.Now()
	path := "/containers/" + url.PathEscape(record.ID) + "/update"
	// Must exceed the agent's own mutating-endpoint timeout (5min, see
	// cmd/agent/main.go) — otherwise the client gives up with "context deadline
	// exceeded" while the agent is still pulling/recreating, logging a false
	// failure for an update that actually goes on to succeed.
	updateErr := callAgent(env, http.MethodPost, path, 6*time.Minute, nil)
	duration := time.Since(start).Milliseconds()

	newImage := record.Image
	if pendingUpdate != nil && pendingUpdate.LatestImage != "" {
		newImage = pendingUpdate.LatestImage
	}

	history := &db.UpdateHistory{
		ContainerID:   record.ID,
		ContainerName: record.Name,
		EnvironmentID: env.ID,
		OldImage:      record.Image,
		NewImage:      newImage,
		Duration:      duration,
	}

	if updateErr != nil {
		history.Status = "failed"
		history.Error = updateErr.Error()
		_ = e.DB.UpdateContainerStatus(record.ID, "failed")
		e.Hub.Publish(ws.EventUpdateFailed, map[string]string{
			"containerId": record.ID,
			"error":       updateErr.Error(),
		})
	} else {
		history.Status = "success"
		_ = e.DB.UpdateContainerStatus(record.ID, "up_to_date")
		e.Hub.Publish(ws.EventUpdateCompleted, map[string]string{
			"containerId": record.ID,
		})
	}

	if err := e.DB.AddHistory(history); err != nil {
		log.Errorf("updateAgentContainer: failed to record history for %s: %v", record.ID, err)
	}
	if notify {
		e.Notifications.NotifyUpdate(history)
	}
	return updateErr
}

// rollbackAgentContainer reverts a container on an agent-managed host to prevImage,
// delegating the pull+recreate to the agent the same way updateAgentContainer does.
func (e *Engine) rollbackAgentContainer(env db.Environment, record *db.ContainerRecord, prevImage string) error {
	e.Hub.Publish(ws.EventUpdateStarted, map[string]string{
		"containerId":   record.ID,
		"containerName": record.Name,
		"type":          "rollback",
	})

	start := time.Now()
	path := "/containers/" + url.PathEscape(record.ID) + "/rollback?image=" + url.QueryEscape(prevImage)
	// Same margin as updateAgentContainer — must exceed the agent's 5min
	// mutating-endpoint timeout.
	rollbackErr := callAgent(env, http.MethodPost, path, 6*time.Minute, nil)
	duration := time.Since(start).Milliseconds()

	history := &db.UpdateHistory{
		ContainerID:   record.ID,
		ContainerName: record.Name,
		EnvironmentID: env.ID,
		OldImage:      record.Image,
		NewImage:      prevImage,
		Duration:      duration,
	}

	if rollbackErr != nil {
		history.Status = "failed"
		history.Error = rollbackErr.Error()
		_ = e.DB.UpdateContainerStatus(record.ID, "failed")
		e.Hub.Publish(ws.EventUpdateFailed, map[string]string{
			"containerId": record.ID,
			"error":       rollbackErr.Error(),
		})
	} else {
		history.Status = "rolled_back"
		_ = e.DB.UpdateContainerStatus(record.ID, "up_to_date")
		e.Hub.Publish(ws.EventUpdateCompleted, map[string]string{
			"containerId": record.ID,
			"type":        "rollback",
		})
	}

	_ = e.DB.AddHistory(history)
	e.Notifications.NotifyUpdate(history)
	return rollbackErr
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

	if record, err := e.DB.GetContainerByID(containerID); err == nil {
		if env, envErr := e.DB.GetEnvironment(record.EnvironmentID); envErr == nil && env.Type == "agent" {
			return e.rollbackAgentContainer(*env, record, prevImage)
		}
	}

	envs, err := e.DB.ListEnvironments()
	if err != nil {
		return err
	}

	for _, env := range envs {
		if env.Type == "agent" {
			continue
		}
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
		rollbackErr := container.PerformRollback(cli, c, prevImage, params)
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
	if errors.Is(err, digest.ErrLocalImage) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "repository does not exist") ||
		strings.Contains(msg, "manifest unknown") ||
		strings.Contains(msg, "no such manifest") ||
		strings.Contains(msg, "name unknown") ||
		strings.Contains(msg, "not found in registry")
}
