// Package main provides the standalone database migration CLI for 6S.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"6s/internal/database"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Printf("migration command failed: %v", redactError(err, os.Getenv("MIGRATION_DB_DSN")))
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 1 || (args[0] != "status" && args[0] != "validate" && args[0] != "up") {
		return fmt.Errorf("usage: migrate <status|validate|up>")
	}
	dsn := os.Getenv("MIGRATION_DB_DSN")
	if strings.TrimSpace(dsn) == "" {
		return fmt.Errorf("MIGRATION_DB_DSN is required")
	}
	timeout, err := migrationTimeout()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	db, err := database.Connect(ctx, dsn, database.DefaultPoolConfig())
	if err != nil {
		return fmt.Errorf("database connection failed")
	}
	defer func() {
		_ = db.Close()
	}()
	switch args[0] {
	case "status":
		return printStatus(ctx, db)
	case "validate":
		return database.ValidateMigrations(ctx, db)
	default:
		return database.RunMigrations(ctx, db)
	}
}

func printStatus(ctx context.Context, db *sql.DB) error {
	status, err := database.MigrationStatus(ctx, db)
	if err != nil {
		return err
	}
	for _, item := range status {
		state := "pending"
		if item.Applied {
			state = "applied"
		}
		fmt.Printf("%d\t%s\t%s\t%s\n", item.Version, item.Name, item.Checksum, state)
	}
	return nil
}

func migrationTimeout() (time.Duration, error) {
	value := os.Getenv("MIGRATION_TIMEOUT")
	if value == "" {
		return 10 * time.Minute, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("invalid MIGRATION_TIMEOUT %q", value)
	}
	return parsed, nil
}

func redactError(err error, secrets ...string) error {
	if err == nil {
		return nil
	}
	message := err.Error()
	for _, secret := range secrets {
		if secret != "" {
			message = strings.ReplaceAll(message, secret, "[redacted]")
		}
	}
	return fmt.Errorf("%s", message)
}
