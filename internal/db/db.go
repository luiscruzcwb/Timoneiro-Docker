package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	log "github.com/sirupsen/logrus"
)

// DB wraps the SQLite connection
type DB struct {
	conn *sql.DB
}

// New opens (or creates) the SQLite database and runs migrations
func New(path string) (*DB, error) {
	conn, err := sql.Open("sqlite3", path+"?_foreign_keys=on")
	if err != nil {
		return nil, err
	}
	d := &DB{conn: conn}
	if err := d.migrate(); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DB) migrate() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS environments (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT NOT NULL,
			host       TEXT NOT NULL,
			tls_cert   TEXT DEFAULT '',
			tls_key    TEXT DEFAULT '',
			tls_ca     TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS containers (
			id             TEXT PRIMARY KEY,
			environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
			name           TEXT NOT NULL,
			image          TEXT NOT NULL,
			status         TEXT NOT NULL DEFAULT 'unknown',
			current_digest TEXT DEFAULT '',
			latest_digest  TEXT DEFAULT '',
			last_checked   DATETIME,
			last_updated   DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS update_history (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			container_id   TEXT NOT NULL,
			container_name TEXT NOT NULL,
			environment_id INTEGER NOT NULL,
			old_image      TEXT NOT NULL,
			new_image      TEXT NOT NULL,
			status         TEXT NOT NULL,
			error          TEXT DEFAULT '',
			duration       INTEGER DEFAULT 0,
			created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS notification_channels (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT NOT NULL,
			type       TEXT NOT NULL,
			config     TEXT NOT NULL DEFAULT '{}',
			enabled    INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS registries (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT NOT NULL,
			host       TEXT NOT NULL,
			type       TEXT NOT NULL DEFAULT 'generic',
			username   TEXT NOT NULL DEFAULT '',
			password   TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS pending_updates (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			container_id   TEXT NOT NULL,
			container_name TEXT NOT NULL,
			environment_id INTEGER NOT NULL,
			current_image  TEXT NOT NULL,
			latest_image   TEXT NOT NULL,
			current_digest TEXT DEFAULT '',
			latest_digest  TEXT DEFAULT '',
			status         TEXT NOT NULL DEFAULT 'pending',
			cve_critical   INTEGER DEFAULT 0,
			cve_high       INTEGER DEFAULT 0,
			cve_medium     INTEGER DEFAULT 0,
			cve_low        INTEGER DEFAULT 0,
			cve_data       TEXT DEFAULT '[]',
			found_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			username      TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token      TEXT PRIMARY KEY,
			user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			expires_at DATETIME NOT NULL
		)`,
	}

	for _, stmt := range statements {
		if _, err := d.conn.Exec(stmt); err != nil {
			return err
		}
	}

	// Additive column migrations — safe to re-run (SQLite returns error if column exists, which we ignore)
	alterations := []string{
		`ALTER TABLE environments ADD COLUMN type TEXT DEFAULT 'socket'`,
		`ALTER TABLE environments ADD COLUMN token TEXT DEFAULT ''`,
		`ALTER TABLE containers ADD COLUMN tags TEXT DEFAULT '[]'`,
		`ALTER TABLE pending_updates ADD COLUMN notes TEXT DEFAULT ''`,
	}
	for _, stmt := range alterations {
		d.conn.Exec(stmt) // nolint: ignore "duplicate column name" on re-run
	}

	return nil
}

// Close closes the database connection
func (d *DB) Close() error {
	return d.conn.Close()
}

// --- Environments ---

func (d *DB) ListEnvironments() ([]Environment, error) {
	rows, err := d.conn.Query(`SELECT id, name, host, COALESCE(type,'socket'), COALESCE(token,''), tls_cert, tls_key, tls_ca, created_at FROM environments`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var envs []Environment
	for rows.Next() {
		var e Environment
		if err := rows.Scan(&e.ID, &e.Name, &e.Host, &e.Type, &e.Token, &e.TLSCert, &e.TLSKey, &e.TLSCA, &e.CreatedAt); err != nil {
			return nil, err
		}
		envs = append(envs, e)
	}
	return envs, nil
}

func (d *DB) CreateEnvironment(e *Environment) error {
	e.CreatedAt = time.Now()
	if e.Type == "" {
		e.Type = "socket"
	}
	res, err := d.conn.Exec(
		`INSERT INTO environments (name, host, type, token, tls_cert, tls_key, tls_ca, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.Name, e.Host, e.Type, e.Token, e.TLSCert, e.TLSKey, e.TLSCA, e.CreatedAt,
	)
	if err != nil {
		return err
	}
	e.ID, _ = res.LastInsertId()
	return nil
}

func (d *DB) GetEnvironment(id int64) (*Environment, error) {
	var e Environment
	err := d.conn.QueryRow(
		`SELECT id, name, host, COALESCE(type,'socket'), COALESCE(token,''), tls_cert, tls_key, tls_ca, created_at FROM environments WHERE id = ?`, id,
	).Scan(&e.ID, &e.Name, &e.Host, &e.Type, &e.Token, &e.TLSCert, &e.TLSKey, &e.TLSCA, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (d *DB) UpdateEnvironment(e *Environment) error {
	_, err := d.conn.Exec(
		`UPDATE environments SET name=?, host=?, type=?, token=?, tls_cert=?, tls_key=?, tls_ca=? WHERE id=?`,
		e.Name, e.Host, e.Type, e.Token, e.TLSCert, e.TLSKey, e.TLSCA, e.ID,
	)
	return err
}

func (d *DB) DeleteEnvironment(id int64) error {
	_, err := d.conn.Exec(`DELETE FROM environments WHERE id = ?`, id)
	return err
}

// --- Containers ---

func (d *DB) UpsertContainer(c *ContainerRecord) error {
	_, err := d.conn.Exec(
		`INSERT INTO containers (id, environment_id, name, image, status, current_digest, latest_digest, last_checked, last_updated)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   name=excluded.name, image=excluded.image, status=excluded.status,
		   current_digest=excluded.current_digest, latest_digest=excluded.latest_digest,
		   last_checked=excluded.last_checked,
		   last_updated=CASE
		     WHEN excluded.last_updated > datetime('2001-01-01') THEN excluded.last_updated
		     ELSE COALESCE(containers.last_updated, excluded.last_updated)
		   END`,
		c.ID, c.EnvironmentID, c.Name, c.Image, c.Status,
		c.CurrentDigest, c.LatestDigest, c.LastChecked, c.LastUpdated,
	)
	return err
}

func (d *DB) ListContainers(environmentID int64) ([]ContainerRecord, error) {
	query := `SELECT id, environment_id, name, image, status, current_digest, latest_digest, COALESCE(tags,'[]'), last_checked, last_updated FROM containers`
	args := []interface{}{}
	if environmentID > 0 {
		query += ` WHERE environment_id = ?`
		args = append(args, environmentID)
	}

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var containers []ContainerRecord
	for rows.Next() {
		var c ContainerRecord
		if err := rows.Scan(&c.ID, &c.EnvironmentID, &c.Name, &c.Image, &c.Status,
			&c.CurrentDigest, &c.LatestDigest, &c.Tags, &c.LastChecked, &c.LastUpdated); err != nil {
			return nil, err
		}
		containers = append(containers, c)
	}
	return containers, nil
}

func (d *DB) GetContainerByID(id string) (*ContainerRecord, error) {
	var c ContainerRecord
	err := d.conn.QueryRow(
		`SELECT id, environment_id, name, image, status, current_digest, latest_digest, COALESCE(tags,'[]'), last_checked, last_updated FROM containers WHERE id = ?`, id,
	).Scan(&c.ID, &c.EnvironmentID, &c.Name, &c.Image, &c.Status,
		&c.CurrentDigest, &c.LatestDigest, &c.Tags, &c.LastChecked, &c.LastUpdated)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (d *DB) UpdateContainerTags(id string, tags string) error {
	_, err := d.conn.Exec(`UPDATE containers SET tags = ? WHERE id = ?`, tags, id)
	return err
}

func (d *DB) UpdateContainerStatus(id, status string) error {
	if status == "up_to_date" {
		_, err := d.conn.Exec(
			`UPDATE containers SET status=?, last_checked=?, last_updated=? WHERE id=?`,
			status, time.Now(), time.Now(), id,
		)
		return err
	}
	_, err := d.conn.Exec(`UPDATE containers SET status=?, last_checked=? WHERE id=?`, status, time.Now(), id)
	return err
}

// DeleteStaleContainers removes container records for an environment that are no longer running
func (d *DB) DeleteStaleContainers(environmentID int64, activeIDs []string) error {
	if len(activeIDs) == 0 {
		return nil
	}
	placeholders := make([]string, len(activeIDs))
	args := make([]interface{}, 0, len(activeIDs)+1)
	args = append(args, environmentID)
	for i, id := range activeIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := fmt.Sprintf(
		`DELETE FROM containers WHERE environment_id = ? AND id NOT IN (%s)`,
		strings.Join(placeholders, ","),
	)
	_, err := d.conn.Exec(query, args...)
	return err
}

// --- History ---

func (d *DB) AddHistory(h *UpdateHistory) error {
	h.CreatedAt = time.Now()
	res, err := d.conn.Exec(
		`INSERT INTO update_history (container_id, container_name, environment_id, old_image, new_image, status, error, duration, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		h.ContainerID, h.ContainerName, h.EnvironmentID, h.OldImage, h.NewImage, h.Status, h.Error, h.Duration, h.CreatedAt,
	)
	if err != nil {
		return err
	}
	h.ID, _ = res.LastInsertId()
	return nil
}

func (d *DB) ListHistory(limit, offset int, environmentID int64, containerID string) ([]UpdateHistory, error) {
	query := `SELECT id, container_id, container_name, environment_id, old_image, new_image, status, error, duration, created_at FROM update_history WHERE 1=1`
	args := []interface{}{}

	if environmentID > 0 {
		query += ` AND environment_id = ?`
		args = append(args, environmentID)
	}
	if containerID != "" {
		query += ` AND container_id = ?`
		args = append(args, containerID)
	}
	query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []UpdateHistory
	for rows.Next() {
		var h UpdateHistory
		if err := rows.Scan(&h.ID, &h.ContainerID, &h.ContainerName, &h.EnvironmentID,
			&h.OldImage, &h.NewImage, &h.Status, &h.Error, &h.Duration, &h.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, h)
	}
	return history, nil
}

func (d *DB) GetLastSuccessfulUpdate(containerID string) (*UpdateHistory, error) {
	var h UpdateHistory
	err := d.conn.QueryRow(
		`SELECT id, container_id, container_name, environment_id, old_image, new_image, status, error, duration, created_at
		 FROM update_history WHERE container_id = ? AND status = 'success' ORDER BY created_at DESC LIMIT 1`,
		containerID,
	).Scan(&h.ID, &h.ContainerID, &h.ContainerName, &h.EnvironmentID,
		&h.OldImage, &h.NewImage, &h.Status, &h.Error, &h.Duration, &h.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &h, nil
}

// --- Notification Channels ---

func (d *DB) ListNotificationChannels() ([]NotificationChannel, error) {
	rows, err := d.conn.Query(`SELECT id, name, type, config, enabled, created_at FROM notification_channels`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []NotificationChannel
	for rows.Next() {
		var nc NotificationChannel
		var enabled int
		if err := rows.Scan(&nc.ID, &nc.Name, &nc.Type, &nc.Config, &enabled, &nc.CreatedAt); err != nil {
			return nil, err
		}
		nc.Enabled = enabled == 1
		channels = append(channels, nc)
	}
	return channels, nil
}

func (d *DB) CreateNotificationChannel(nc *NotificationChannel) error {
	nc.CreatedAt = time.Now()
	enabled := 0
	if nc.Enabled {
		enabled = 1
	}
	res, err := d.conn.Exec(
		`INSERT INTO notification_channels (name, type, config, enabled, created_at) VALUES (?, ?, ?, ?, ?)`,
		nc.Name, nc.Type, nc.Config, enabled, nc.CreatedAt,
	)
	if err != nil {
		return err
	}
	nc.ID, _ = res.LastInsertId()
	return nil
}

func (d *DB) UpdateNotificationChannel(nc *NotificationChannel) error {
	enabled := 0
	if nc.Enabled {
		enabled = 1
	}
	_, err := d.conn.Exec(
		`UPDATE notification_channels SET name=?, type=?, config=?, enabled=? WHERE id=?`,
		nc.Name, nc.Type, nc.Config, enabled, nc.ID,
	)
	return err
}

func (d *DB) DeleteNotificationChannel(id int64) error {
	_, err := d.conn.Exec(`DELETE FROM notification_channels WHERE id = ?`, id)
	return err
}

func (d *DB) GetNotificationChannel(id int64) (*NotificationChannel, error) {
	var nc NotificationChannel
	var enabled int
	err := d.conn.QueryRow(
		`SELECT id, name, type, config, enabled, created_at FROM notification_channels WHERE id = ?`, id,
	).Scan(&nc.ID, &nc.Name, &nc.Type, &nc.Config, &enabled, &nc.CreatedAt)
	if err != nil {
		return nil, err
	}
	nc.Enabled = enabled == 1
	return &nc, nil
}

// --- Pending Updates ---

func (d *DB) UpsertPendingUpdate(u *PendingUpdate) error {
	u.UpdatedAt = time.Now()
	var existingID int64
	err := d.conn.QueryRow(
		`SELECT id FROM pending_updates WHERE container_id = ? AND status = 'pending'`,
		u.ContainerID,
	).Scan(&existingID)

	if err == nil {
		_, err = d.conn.Exec(
			`UPDATE pending_updates SET latest_image=?, latest_digest=?, cve_critical=?, cve_high=?, cve_medium=?, cve_low=?, cve_data=?, updated_at=? WHERE id=?`,
			u.LatestImage, u.LatestDigest, u.CVECritical, u.CVEHigh, u.CVEMedium, u.CVELow, u.CVEData, u.UpdatedAt, existingID,
		)
		u.ID = existingID
		return err
	}

	u.FoundAt = time.Now()
	res, err := d.conn.Exec(
		`INSERT INTO pending_updates (container_id, container_name, environment_id, current_image, latest_image, current_digest, latest_digest, status, cve_critical, cve_high, cve_medium, cve_low, cve_data, found_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
		u.ContainerID, u.ContainerName, u.EnvironmentID, u.CurrentImage, u.LatestImage, u.CurrentDigest, u.LatestDigest, u.CVECritical, u.CVEHigh, u.CVEMedium, u.CVELow, u.CVEData, u.FoundAt, u.UpdatedAt,
	)
	if err != nil {
		return err
	}
	u.ID, _ = res.LastInsertId()
	return nil
}

func (d *DB) ListPendingUpdates(status string, environmentID int64) ([]PendingUpdate, error) {
	query := `SELECT id, container_id, container_name, environment_id, current_image, latest_image, current_digest, latest_digest, status, cve_critical, cve_high, cve_medium, cve_low, cve_data, COALESCE(notes,''), found_at, updated_at FROM pending_updates WHERE 1=1`
	args := []interface{}{}
	if status != "" && status != "all" {
		query += ` AND status = ?`
		args = append(args, status)
	}
	if environmentID > 0 {
		query += ` AND environment_id = ?`
		args = append(args, environmentID)
	}
	query += ` ORDER BY found_at DESC`

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var updates []PendingUpdate
	for rows.Next() {
		var u PendingUpdate
		if err := rows.Scan(&u.ID, &u.ContainerID, &u.ContainerName, &u.EnvironmentID,
			&u.CurrentImage, &u.LatestImage, &u.CurrentDigest, &u.LatestDigest,
			&u.Status, &u.CVECritical, &u.CVEHigh, &u.CVEMedium, &u.CVELow,
			&u.CVEData, &u.Notes, &u.FoundAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		updates = append(updates, u)
	}
	return updates, nil
}

func (d *DB) GetPendingUpdateByContainerID(containerID string) (*PendingUpdate, error) {
	var u PendingUpdate
	err := d.conn.QueryRow(
		`SELECT id, container_id, container_name, environment_id, current_image, latest_image, current_digest, latest_digest, status, cve_critical, cve_high, cve_medium, cve_low, cve_data, COALESCE(notes,''), found_at, updated_at FROM pending_updates WHERE container_id = ? AND status IN ('pending','approved','deploying') ORDER BY found_at DESC LIMIT 1`,
		containerID,
	).Scan(&u.ID, &u.ContainerID, &u.ContainerName, &u.EnvironmentID,
		&u.CurrentImage, &u.LatestImage, &u.CurrentDigest, &u.LatestDigest,
		&u.Status, &u.CVECritical, &u.CVEHigh, &u.CVEMedium, &u.CVELow,
		&u.CVEData, &u.Notes, &u.FoundAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) UpdatePendingUpdateStatus(id int64, status string) error {
	_, err := d.conn.Exec(
		`UPDATE pending_updates SET status=?, updated_at=? WHERE id=?`,
		status, time.Now(), id,
	)
	return err
}

func (d *DB) GetPendingUpdate(id int64) (*PendingUpdate, error) {
	var u PendingUpdate
	err := d.conn.QueryRow(
		`SELECT id, container_id, container_name, environment_id, current_image, latest_image, current_digest, latest_digest, status, cve_critical, cve_high, cve_medium, cve_low, cve_data, COALESCE(notes,''), found_at, updated_at FROM pending_updates WHERE id = ?`, id,
	).Scan(&u.ID, &u.ContainerID, &u.ContainerName, &u.EnvironmentID,
		&u.CurrentImage, &u.LatestImage, &u.CurrentDigest, &u.LatestDigest,
		&u.Status, &u.CVECritical, &u.CVEHigh, &u.CVEMedium, &u.CVELow,
		&u.CVEData, &u.Notes, &u.FoundAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) UpdatePendingUpdateNotes(id int64, notes string) error {
	_, err := d.conn.Exec(
		`UPDATE pending_updates SET notes=?, updated_at=? WHERE id=?`,
		notes, time.Now(), id,
	)
	return err
}

func (d *DB) UpdatePendingUpdateCVE(id int64, critical, high, medium, low int, cveData string) error {
	_, err := d.conn.Exec(
		`UPDATE pending_updates SET cve_critical=?, cve_high=?, cve_medium=?, cve_low=?, cve_data=?, updated_at=? WHERE id=?`,
		critical, high, medium, low, cveData, time.Now(), id,
	)
	return err
}

// --- Settings ---

func (d *DB) GetPolicySettings() (PolicySettings, error) {
	var raw string
	err := d.conn.QueryRow(`SELECT value FROM settings WHERE key = 'policy'`).Scan(&raw)
	if err == sql.ErrNoRows {
		return DefaultPolicySettings(), nil
	}
	if err != nil {
		return DefaultPolicySettings(), err
	}
	var p PolicySettings
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return DefaultPolicySettings(), err
	}
	return p, nil
}

func (d *DB) SavePolicySettings(p PolicySettings) error {
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	_, err = d.conn.Exec(
		`INSERT INTO settings (key, value) VALUES ('policy', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		string(data),
	)
	return err
}

func (d *DB) GetNotifyState() (NotifyState, error) {
	var raw string
	err := d.conn.QueryRow(`SELECT value FROM settings WHERE key = 'notify_state'`).Scan(&raw)
	if err == sql.ErrNoRows {
		return NotifyState{}, nil
	}
	if err != nil {
		return NotifyState{}, err
	}
	var s NotifyState
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return NotifyState{}, err
	}
	return s, nil
}

func (d *DB) SaveNotifyState(s NotifyState) error {
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	_, err = d.conn.Exec(
		`INSERT INTO settings (key, value) VALUES ('notify_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		string(data),
	)
	return err
}

// --- Registries ---

func (d *DB) ListRegistries() ([]Registry, error) {
	rows, err := d.conn.Query(`SELECT id, name, host, type, username, password, created_at FROM registries ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var regs []Registry
	for rows.Next() {
		var r Registry
		if err := rows.Scan(&r.ID, &r.Name, &r.Host, &r.Type, &r.Username, &r.Password, &r.CreatedAt); err != nil {
			return nil, err
		}
		regs = append(regs, r)
	}
	return regs, nil
}

func (d *DB) CreateRegistry(r *Registry) error {
	r.CreatedAt = time.Now()
	res, err := d.conn.Exec(
		`INSERT INTO registries (name, host, type, username, password, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		r.Name, r.Host, r.Type, r.Username, r.Password, r.CreatedAt,
	)
	if err != nil {
		return err
	}
	r.ID, _ = res.LastInsertId()
	return nil
}

func (d *DB) UpdateRegistry(r *Registry) error {
	_, err := d.conn.Exec(
		`UPDATE registries SET name=?, host=?, type=?, username=?, password=? WHERE id=?`,
		r.Name, r.Host, r.Type, r.Username, r.Password, r.ID,
	)
	return err
}

func (d *DB) DeleteRegistry(id int64) error {
	_, err := d.conn.Exec(`DELETE FROM registries WHERE id=?`, id)
	return err
}

func (d *DB) GetRegistryByHost(host string) (*Registry, error) {
	var r Registry
	err := d.conn.QueryRow(
		`SELECT id, name, host, type, username, password, created_at FROM registries WHERE host=? LIMIT 1`, host,
	).Scan(&r.ID, &r.Name, &r.Host, &r.Type, &r.Username, &r.Password, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// SeedDefaultEnvironment inserts a local Docker environment if none exists
func (d *DB) SeedDefaultEnvironment() {
	var count int
	if err := d.conn.QueryRow(`SELECT COUNT(*) FROM environments`).Scan(&count); err != nil {
		log.Warn("Could not check environments count:", err)
		return
	}
	if count == 0 {
		e := &Environment{
			Name: "Local",
			Host: "unix:///var/run/docker.sock",
		}
		if err := d.CreateEnvironment(e); err != nil {
			log.Warn("Could not seed default environment:", err)
		} else {
			log.Info("Created default local Docker environment")
		}
	}
}
