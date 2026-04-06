package main

import (
	"log"
	"os"

	"zhaogeban/backend/internal/api"
	"zhaogeban/backend/internal/db"
)

func main() {
	database, err := db.OpenSQLite()
	if err != nil {
		log.Fatalf("init db failed: %v", err)
	}

	router := api.NewRouter(database)
	addr := envOrDefault("BACKEND_ADDR", ":8080")
	log.Printf("backend listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("server run failed: %v", err)
	}
}

func envOrDefault(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}
