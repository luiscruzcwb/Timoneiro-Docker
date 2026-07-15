package notifications

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/containrrr/shoutrrr"
	"github.com/containrrr/shoutrrr/pkg/types"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	log "github.com/sirupsen/logrus"
)

// checkSummaryReminderInterval bounds how often an unchanged actionable batch
// (same containers still update_available/failed) gets re-sent as a reminder.
const checkSummaryReminderInterval = 6 * time.Hour

// ContainerResult holds one container's check result for the batch summary
type ContainerResult struct {
	Name   string
	Image  string
	Status string // up_to_date, update_available, failed, local, unknown
}

// CheckSummary holds the full result of one check cycle across all environments
type CheckSummary struct {
	EnvironmentName string
	Containers      []ContainerResult
}

// Manager sends notifications through configured channels via Shoutrrr
type Manager struct {
	DB *db.DB
}

// NewManager creates a new notification Manager
func NewManager(database *db.DB) *Manager {
	return &Manager{DB: database}
}

// NotifyUpdate sends a notification about a container update to all enabled channels
func (m *Manager) NotifyUpdate(history *db.UpdateHistory) {
	channels, err := m.DB.ListNotificationChannels()
	if err != nil {
		log.Errorf("Failed to load notification channels: %v", err)
		return
	}

	status := history.Status
	if status == "success" {
		status = "atualizado com sucesso"
	} else if status == "failed" {
		status = "falhou"
	}

	subject := fmt.Sprintf("Timoneiro — %s %s", history.ContainerName, status)
	msg := fmt.Sprintf("Timoneiro — %s: %s → %s (%s)",
		history.ContainerName, history.OldImage, history.NewImage, status)

	for _, ch := range channels {
		if !ch.Enabled {
			continue
		}
		go func(channel db.NotificationChannel) {
			if err := m.send(&channel, subject, msg); err != nil {
				log.Errorf("Notification failed [%s]: %v", channel.Name, err)
			}
		}(ch)
	}
}

// Test sends a test message through a specific channel
func (m *Manager) Test(nc *db.NotificationChannel) error {
	subject := fmt.Sprintf("Timoneiro — teste do canal \"%s\"", nc.Name)
	return m.send(nc, subject, fmt.Sprintf("Timoneiro — canal \"%s\" configurado com sucesso!", nc.Name))
}

// NotifyCheckSummary sends a consolidated batch email at the end of a check cycle.
// Only sends when there are updates available or errors — stays silent when everything is fresh.
func (m *Manager) NotifyCheckSummary(summaries []CheckSummary) {
	var allContainers []ContainerResult
	for _, s := range summaries {
		allContainers = append(allContainers, s.Containers...)
	}
	if len(allContainers) == 0 {
		return
	}

	var available, failed []ContainerResult
	var upToDate []string
	for _, c := range allContainers {
		switch c.Status {
		case "update_available":
			available = append(available, c)
		case "failed":
			failed = append(failed, c)
		default:
			name := strings.TrimPrefix(c.Name, "/")
			upToDate = append(upToDate, name)
		}
	}

	// Only notify when there's something actionable
	if len(available) == 0 && len(failed) == 0 {
		// Reset dedup state so the next actionable batch is treated as fresh
		// rather than compared against a stale hash from a previous incident.
		_ = m.DB.SaveNotifyState(db.NotifyState{})
		return
	}

	// Don't re-send an identical batch every check cycle — a container stuck
	// in update_available (e.g. awaiting manual approval) or failed (e.g. a
	// persistent digest-check error) would otherwise trigger an email every
	// single check interval, forever. Only send when the actionable set
	// changed, or after checkSummaryReminderInterval has passed since the
	// last send.
	hash := fingerprintActionable(available, failed)
	state, err := m.DB.GetNotifyState()
	if err != nil {
		log.Errorf("NotifyCheckSummary: failed to load notify state: %v", err)
	}
	if state.Hash == hash && time.Since(state.LastSentAt) < checkSummaryReminderInterval {
		return
	}

	var subject string
	switch {
	case len(available) > 0 && len(failed) > 0:
		subject = fmt.Sprintf("Timoneiro — %d atualização(ões) disponível(is), %d erro(s)", len(available), len(failed))
	case len(failed) > 0:
		subject = fmt.Sprintf("Timoneiro — %d erro(s) de atualização", len(failed))
	default:
		subject = fmt.Sprintf("Timoneiro — %d atualização(ões) disponível(is)", len(available))
	}

	var lines []string
	lines = append(lines, fmt.Sprintf("Timoneiro — ciclo de verificação · %d containers", len(allContainers)))
	lines = append(lines, strings.Repeat("-", 52))
	lines = append(lines, "")

	if len(available) > 0 {
		lines = append(lines, fmt.Sprintf("Atualizações disponíveis (%d):", len(available)))
		for _, c := range available {
			lines = append(lines, fmt.Sprintf("  %s → %s", strings.TrimPrefix(c.Name, "/"), c.Image))
		}
		lines = append(lines, "")
	}

	if len(failed) > 0 {
		lines = append(lines, fmt.Sprintf("Erros (%d):", len(failed)))
		for _, c := range failed {
			lines = append(lines, fmt.Sprintf("  %s → %s", strings.TrimPrefix(c.Name, "/"), c.Image))
		}
		lines = append(lines, "")
	}

	if len(upToDate) > 0 {
		lines = append(lines, fmt.Sprintf("Em dia (%d):", len(upToDate)))
		// wrap names in groups of 4
		for i := 0; i < len(upToDate); i += 4 {
			end := i + 4
			if end > len(upToDate) {
				end = len(upToDate)
			}
			lines = append(lines, "  "+strings.Join(upToDate[i:end], " · "))
		}
	}

	message := strings.Join(lines, "\n")

	channels, err := m.DB.ListNotificationChannels()
	if err != nil {
		log.Errorf("NotifyCheckSummary: failed to load channels: %v", err)
		return
	}
	for _, ch := range channels {
		if !ch.Enabled {
			continue
		}
		ch := ch
		go func() {
			if err := m.send(&ch, subject, message); err != nil {
				log.Errorf("NotifyCheckSummary failed [%s]: %v", ch.Name, err)
			}
		}()
	}

	if err := m.DB.SaveNotifyState(db.NotifyState{Hash: hash, LastSentAt: time.Now()}); err != nil {
		log.Errorf("NotifyCheckSummary: failed to save notify state: %v", err)
	}
}

// fingerprintActionable returns a stable hash of the actionable containers
// (update_available + failed), so callers can detect whether a batch is
// identical to the last one sent and skip re-notifying about it.
func fingerprintActionable(available, failed []ContainerResult) string {
	items := make([]string, 0, len(available)+len(failed))
	for _, c := range available {
		items = append(items, "A:"+c.Name+"|"+c.Image)
	}
	for _, c := range failed {
		items = append(items, "F:"+c.Name+"|"+c.Image)
	}
	sort.Strings(items)
	sum := sha256.Sum256([]byte(strings.Join(items, ",")))
	return hex.EncodeToString(sum[:])
}

// send dispatches a message through the channel's shoutrrr URL. subject is only
// applied to SMTP channels (shoutrrr ignores/rejects the "subject" param on
// services that don't support it), overriding the URL's default per-message.
func (m *Manager) send(nc *db.NotificationChannel, subject, message string) error {
	url := strings.TrimSpace(nc.Config)
	if url == "" {
		return fmt.Errorf("shoutrrr URL não configurada para o canal %q", nc.Name)
	}

	if nc.Type != "smtp" || subject == "" {
		return shoutrrr.Send(url, message)
	}

	sender, err := shoutrrr.CreateSender(url)
	if err != nil {
		return err
	}
	params := &types.Params{"subject": subject}
	for _, sendErr := range sender.Send(message, params) {
		if sendErr != nil {
			return sendErr
		}
	}
	return nil
}
