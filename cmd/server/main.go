package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"6s/internal/auth"
	"6s/internal/config"
	"6s/internal/crypto"
	"6s/internal/database"
	"6s/internal/db"
	"6s/internal/response"
)

func main() {
	cfg, err := config.Load(os.Args[1:])
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx := context.Background()
	var dbConn *sql.DB
	dbConn, err = database.Connect(ctx, cfg.DBDSN, database.DefaultPoolConfig())
	if err != nil {
		log.Printf("warning: db connection failed (will retry or operate offline): %v", err)
	} else {
		defer func() {
			if err := dbConn.Close(); err != nil {
				log.Printf("error closing db: %v", err)
			}
		}()
	}

	var cipher *crypto.Cipher
	if cfg.EncryptionKey != "" {
		c, err := crypto.NewCipher(cfg.EncryptionKey)
		if err != nil {
			log.Printf("warning: invalid APP_ENCRYPTION_KEY: %v", err)
		} else {
			cipher = c
		}
	}

	r := setupRouter(dbConn, cfg, cipher, nil)

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

func setupRouter(dbConn *sql.DB, cfg *config.Config, cipher *crypto.Cipher, ldapClient auth.LDAPClient) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// Health check (unauthenticated)
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "disconnected"
		if dbConn != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 1*time.Second)
			defer cancel()
			if err := dbConn.PingContext(ctx); err == nil {
				dbStatus = "ok"
			}
		}

		response.JSON(w, http.StatusOK, map[string]string{
			"status": "ok",
			"db":     dbStatus,
		})
	})

	if dbConn != nil && cfg != nil {
		queries := db.New(dbConn)
		jwtKey := []byte(cfg.JWTSecret)
		if len(jwtKey) == 0 {
			jwtKey = []byte("default-secret-key-32-bytes-secure")
		}
		tm := auth.NewTokenManager(jwtKey)

		var trustedProxies []string
		if cfg.TrustedProxies != "" {
			for _, p := range strings.Split(cfg.TrustedProxies, ",") {
				if trimmed := strings.TrimSpace(p); trimmed != "" {
					trustedProxies = append(trustedProxies, trimmed)
				}
			}
		}
		limiter := auth.NewLoginLimiter(trustedProxies)

		authHandler := auth.NewHandler(queries, tm, limiter, cipher, ldapClient)
		authMw := auth.NewMiddleware(tm, queries)
		adHandler := auth.NewADConfigHandler(queries, cipher, ldapClient)

		// Public auth routes
		r.Route("/api/auth", func(ar chi.Router) {
			ar.Post("/login", authHandler.Login)
			ar.Post("/refresh", authHandler.Refresh)

			// Authenticated auth routes
			ar.Group(func(pr chi.Router) {
				pr.Use(authMw.Authenticate)
				pr.Post("/revoke", authHandler.Revoke)
				pr.Get("/sessions", authHandler.Sessions)
			})
		})

		// Config routes (Admin only)
		r.Route("/api/config", func(cr chi.Router) {
			cr.Use(authMw.Authenticate)
			cr.Use(auth.RequireRole("ADMIN"))

			cr.Get("/ad", adHandler.GetADConfig)
			cr.Put("/ad", adHandler.UpdateADConfig)
			cr.Post("/ad/test", adHandler.TestADConfig)
		})
	}

	return r
}
