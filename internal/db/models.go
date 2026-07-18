package db

import "time"

// Environment represents a Docker host configuration
type Environment struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Host      string    `json:"host"`
	Type      string    `json:"type"`  // socket, tcp, agent
	Token     string    `json:"token,omitempty"`
	TLSCert   string    `json:"tlsCert,omitempty"`
	TLSKey    string    `json:"tlsKey,omitempty"`
	TLSCA     string    `json:"tlsCA,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// ContainerRecord tracks state of a monitored container
type ContainerRecord struct {
	ID            string    `json:"id"`
	EnvironmentID int64     `json:"environmentId"`
	Name          string    `json:"name"`
	Image         string    `json:"image"`
	Status        string    `json:"status"` // up_to_date, update_available, updating, failed
	CurrentDigest string    `json:"currentDigest"`
	LatestDigest  string    `json:"latestDigest"`
	Tags          string    `json:"tags"` // JSON array of user-defined tag strings
	LastChecked   time.Time `json:"lastChecked"`
	LastUpdated   time.Time `json:"lastUpdated"`
}

// UpdateHistory logs each update event
type UpdateHistory struct {
	ID            int64     `json:"id"`
	ContainerID   string    `json:"containerId"`
	ContainerName string    `json:"containerName"`
	EnvironmentID int64     `json:"environmentId"`
	OldImage      string    `json:"oldImage"`
	NewImage      string    `json:"newImage"`
	Status        string    `json:"status"` // success, failed, rolled_back
	Error         string    `json:"error,omitempty"`
	Duration      int64     `json:"duration"` // milliseconds
	CreatedAt     time.Time `json:"createdAt"`
}

// NotificationChannel stores a configured notification destination
type NotificationChannel struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // slack, telegram, email, webhook, discord, gotify
	Config    string    `json:"config"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"createdAt"`
}

// PolicySettings holds the global update policy configuration
type PolicySettings struct {
	UpdateMode          string               `json:"updateMode"` // automatic, manual, scheduled
	VersionPolicy       VersionPolicy        `json:"versionPolicy"`
	ContainerExceptions []ContainerException `json:"containerExceptions"`
	StackExceptions     []StackException     `json:"stackExceptions"`
	MaintenanceWindows  []MaintenanceWindow  `json:"maintenanceWindows"`
}

type VersionPolicy struct {
	Major bool `json:"major"`
	Minor bool `json:"minor"`
	Patch bool `json:"patch"`
}

type ContainerException struct {
	ID              string `json:"id"`
	ContainerID     string `json:"containerId"`
	ContainerName   string `json:"containerName"`
	EnvironmentID   int64  `json:"environmentId"`
	EnvironmentName string `json:"environmentName"`
	Mode            string `json:"mode"` // automatic, manual, scheduled, skip
}

type StackException struct {
	ID        string `json:"id"`
	StackName string `json:"stackName"`
	Mode      string `json:"mode"`
}

type MaintenanceWindow struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Days           []int    `json:"days"`
	StartTime      string   `json:"startTime"`
	EndTime        string   `json:"endTime"`
	Enabled        bool     `json:"enabled"`
	Scope          string   `json:"scope"` // all, environment, containers
	EnvironmentIDs []int64  `json:"environmentIds"`
	ContainerIDs   []string `json:"containerIds"`
}

// Registry stores credentials for a private container registry
type Registry struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Host      string    `json:"host"`     // e.g. "index.docker.io", "ghcr.io"
	Type      string    `json:"type"`     // dockerhub, ghcr, generic
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	CreatedAt time.Time `json:"createdAt"`
}

// NotifyState tracks the last check-summary email sent, capping it to at
// most one per checkSummaryInterval regardless of how often the actionable
// set changes in between.
type NotifyState struct {
	LastSentAt time.Time `json:"lastSentAt"`
}

func DefaultPolicySettings() PolicySettings {
	return PolicySettings{
		UpdateMode:          "manual",
		VersionPolicy:       VersionPolicy{Major: false, Minor: true, Patch: true},
		ContainerExceptions: []ContainerException{},
		StackExceptions:     []StackException{},
		MaintenanceWindows:  []MaintenanceWindow{},
	}
}

// PendingUpdate represents a detected image update awaiting approval
type PendingUpdate struct {
	ID            int64     `json:"id"`
	ContainerID   string    `json:"containerId"`
	ContainerName string    `json:"containerName"`
	EnvironmentID int64     `json:"environmentId"`
	CurrentImage  string    `json:"currentImage"`
	LatestImage   string    `json:"latestImage"`
	CurrentDigest string    `json:"currentDigest"`
	LatestDigest  string    `json:"latestDigest"`
	Status        string    `json:"status"` // pending, approved, ignored, deploying, deployed, failed
	CVECritical   int       `json:"cveCritical"`
	CVEHigh       int       `json:"cveHigh"`
	CVEMedium     int       `json:"cveMedium"`
	CVELow        int       `json:"cveLow"`
	CVEData       string    `json:"cveData"` // JSON array
	Notes         string    `json:"notes"`
	FoundAt       time.Time `json:"foundAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// User represents the admin account
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

// Session represents an active login session
type Session struct {
	Token     string    `json:"-"`
	UserID    int64     `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}
