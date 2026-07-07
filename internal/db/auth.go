package db

import (
	"database/sql"
	"errors"
	"time"
)

var ErrNotFound = errors.New("not found")

// CountUsers returns how many admin accounts exist (0 means first-run setup is needed)
func (d *DB) CountUsers() (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func (d *DB) CreateUser(username, passwordHash string) (*User, error) {
	now := time.Now()
	res, err := d.conn.Exec(
		`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, passwordHash, now,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &User{ID: id, Username: username, PasswordHash: passwordHash, CreatedAt: now}, nil
}

func (d *DB) GetUserByUsername(username string) (*User, error) {
	var u User
	err := d.conn.QueryRow(
		`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`, username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) GetUserByID(id int64) (*User, error) {
	var u User
	err := d.conn.QueryRow(
		`SELECT id, username, password_hash, created_at FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) UpdateUserPassword(id int64, passwordHash string) error {
	_, err := d.conn.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, id)
	return err
}

func (d *DB) CreateSession(userID int64, token string, expiresAt time.Time) error {
	_, err := d.conn.Exec(
		`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		token, userID, time.Now(), expiresAt,
	)
	return err
}

// GetSession returns the session if it exists and has not expired; expired sessions are deleted lazily
func (d *DB) GetSession(token string) (*Session, error) {
	var s Session
	err := d.conn.QueryRow(
		`SELECT token, user_id, created_at, expires_at FROM sessions WHERE token = ?`, token,
	).Scan(&s.Token, &s.UserID, &s.CreatedAt, &s.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if s.ExpiresAt.Before(time.Now()) {
		d.DeleteSession(token)
		return nil, ErrNotFound
	}
	return &s, nil
}

func (d *DB) DeleteSession(token string) error {
	_, err := d.conn.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

// DeleteSessionsForUser is used when a password changes, to invalidate other active sessions
func (d *DB) DeleteSessionsForUser(userID int64) error {
	_, err := d.conn.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}
