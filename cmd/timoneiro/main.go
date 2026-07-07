package main

import (
	"os"
	"strconv"
	"time"

	"github.com/luiscruzcwb/timoneiro/internal/api"
	apiws "github.com/luiscruzcwb/timoneiro/internal/api/ws"
	"github.com/luiscruzcwb/timoneiro/internal/db"
	"github.com/luiscruzcwb/timoneiro/internal/engine"
	"github.com/luiscruzcwb/timoneiro/internal/notifications"
	webui "github.com/luiscruzcwb/timoneiro/web"
	log "github.com/sirupsen/logrus"
)

func main() {
	log.SetFormatter(&log.TextFormatter{FullTimestamp: true})
	log.SetLevel(log.InfoLevel)
	if os.Getenv("TIMONEIRO_DEBUG") == "true" {
		log.SetLevel(log.DebugLevel)
	}

	dbPath := getEnv("TIMONEIRO_DB_PATH", "./timoneiro.db")
	port := getEnv("TIMONEIRO_PORT", "8080")
	intervalSec := getEnvInt("TIMONEIRO_CHECK_INTERVAL", 300)

	log.Infof("Timoneiro starting up")
	log.Infof("Database: %s", dbPath)
	log.Infof("Check interval: %ds", intervalSec)

	database, err := db.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	database.SeedDefaultEnvironment()

	hub := apiws.NewHub()
	go hub.Run()

	nm := notifications.NewManager(database)

	eng := engine.New(database, hub, nm, time.Duration(intervalSec)*time.Second)
	eng.Start()

	srv := api.NewServer(database, eng, hub, nm, port, webui.FS)
	if err := srv.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
