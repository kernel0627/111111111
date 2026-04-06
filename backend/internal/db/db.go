package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"zhaogeban/backend/internal/model"
)

func OpenSQLite() (*gorm.DB, error) {
	dataDir := filepath.Join("data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "app.db")
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", dbPath)

	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	if err := database.AutoMigrate(
		&model.User{},
		&model.Post{},
		&model.PostParticipant{},
		&model.ChatMessage{},
		&model.Review{},
		&model.ActivityScore{},
		&model.PostParticipantSettlement{},
		&model.CreditLedger{},
		&model.AdminCase{},
		&model.UserTag{},
		&model.FeedExposure{},
		&model.FeedClick{},
		&model.PostEmbedding{},
		&model.UserEmbedding{},
		&model.RecommendationModel{},
		&model.RefreshToken{},
		&model.RevokedAccessToken{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}
	if err := EnsureDefaultAdmin(database); err != nil {
		return nil, fmt.Errorf("ensure default admin: %w", err)
	}

	return database, nil
}
