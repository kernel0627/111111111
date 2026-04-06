package main

import (
	"log"

	"zhaogeban/backend/internal/db"
)

func main() {
	database, err := db.OpenSQLite()
	if err != nil {
		log.Fatalf("open db failed: %v", err)
	}
	if err := db.EnsureDefaultAdmin(database); err != nil {
		log.Fatalf("seed admin failed: %v", err)
	}
	log.Println("seed admin done")
}
