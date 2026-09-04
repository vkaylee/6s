package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"6s/internal/config"
	"6s/internal/database"
	"6s/internal/response"
)

func main() {
	cfg, err := config.Load(os.Args[1:])
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx := context.Background()
	var db *sql.DB
	db, err = database.Connect(ctx, cfg.DBDSN, database.DefaultPoolConfig())
	if err != nil {
		log.Printf("warning: db connection failed (will retry or operate offline): %v", err)
	} else {
		defer func() {
			if err := db.Close(); err != nil {
				log.Printf("error closing db: %v", err)
			}
		}()
	}
	r := setupRouter(db)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           r,
		ReadHeaderTimeout: 3 * time.Second,
	}

	log.Printf("Server listening on :%s", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server terminated: %v", err)
	}
}

func setupRouter(db *sql.DB) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "disconnected"
		if db != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 1*time.Second)
			defer cancel()
			if err := db.PingContext(ctx); err == nil {
				dbStatus = "ok"
			}
		}

		response.JSON(w, http.StatusOK, map[string]string{
			"status": "ok",
			"db":     dbStatus,
		})
	})

	return r
}
