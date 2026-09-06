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

	"6s/internal/ai"
	"6s/internal/auth"
	"6s/internal/config"
	"6s/internal/cron"
	"6s/internal/crypto"
	"6s/internal/database"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/issue"
	"6s/internal/masterdata"
	"6s/internal/notification"
	"6s/internal/report"
	"6s/internal/response"
	"6s/internal/scoring"
	"6s/internal/storage"
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
		if err := database.RunMigrations(ctx, dbConn); err != nil {
			log.Printf("warning: run migrations failed: %v", err)
		}
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
	timeoutMw := middleware.Timeout(60 * time.Second)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path == "/api/issues/events" {
				next.ServeHTTP(w, req)
				return
			}
			timeoutMw(next).ServeHTTP(w, req)
		})
	})
	r.Use(i18n.Middleware)
	// Health check (unauthenticated) - supports GET and HEAD (for wget --spider)
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
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
	}
	r.Get("/api/health", healthHandler)
	r.Head("/api/health", healthHandler)

	if dbConn != nil && cfg != nil {
		registerAPIRoutes(r, dbConn, cfg, cipher, ldapClient)
	}

	storageDir := ""
	if cfg != nil {
		storageDir = cfg.DataDir
	}
	registerStaticRoutes(r, storageDir)
	return r
}

func registerAPIRoutes(r *chi.Mux, dbConn *sql.DB, cfg *config.Config, cipher *crypto.Cipher, ldapClient auth.LDAPClient) {
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

	ticketMgr := auth.NewTicketManager()
	authHandler := auth.NewHandler(queries, tm, limiter, cipher, ldapClient, ticketMgr)
	authMw := auth.NewMiddleware(tm, queries, ticketMgr)
	adHandler := auth.NewADConfigHandler(queries, cipher, ldapClient)

	// Public auth routes
	r.Route("/api/auth", func(ar chi.Router) {
		ar.Post("/login", authHandler.Login)
		ar.Post("/refresh", authHandler.Refresh)
		ar.Get("/setup-status", authHandler.SetupStatus)
		ar.Post("/setup", authHandler.SetupSuperadmin)

		// Authenticated auth routes
		ar.Group(func(pr chi.Router) {
			pr.Use(authMw.Authenticate)
			pr.Post("/ticket", authHandler.CreateTicket)
			pr.Post("/revoke", authHandler.Revoke)
			pr.Get("/sessions", authHandler.Sessions)
		})
	})

	// Config routes (Admin only)
	r.Route("/api/config", func(cr chi.Router) {
		cr.Use(authMw.Authenticate)
		cr.Use(auth.RequireRole(auth.RoleAdmin))

		cr.Get("/ad", adHandler.GetADConfig)
		cr.Put("/ad", adHandler.UpdateADConfig)
		cr.Post("/ad/test", adHandler.TestADConfig)
	})

	registerBusinessRoutes(r, queries, authMw, cipher, cfg)
}

func registerBusinessRoutes(r *chi.Mux, queries *db.Queries, authMw *auth.Middleware, cipher *crypto.Cipher, cfg *config.Config) {
	storageDir := cfg.DataDir
	if storageDir == "" {
		storageDir = "./data"
	}
	storageMgr, err := storage.NewManager(storageDir)
	if err != nil {
		log.Printf("Warning: failed to init storage manager: %v", err)
	} else {
		r.Mount("/uploads", storageMgr.FileServer())
	}

	registerMasterDataRoutes(r, queries, authMw)

	notifyCh := make(chan struct{}, 10)
	registerIssueRoutes(r, queries, storageMgr, authMw, notifyCh)
	registerScoringAndNotificationRoutes(r, queries, authMw, cipher, notifyCh, storageDir)
}

func registerMasterDataRoutes(r *chi.Mux, queries *db.Queries, authMw *auth.Middleware) {
	mdHandler := masterdata.NewHandler(queries)
	r.Route("/api/locations", func(lr chi.Router) {
		lr.Use(authMw.Authenticate)
		lr.Get("/", mdHandler.ListLocations)
		lr.With(auth.RequireRole(auth.RoleAdmin)).Get("/all", mdHandler.ListAllLocations)
		lr.With(auth.RequireRole(auth.RoleAdmin)).Post("/", mdHandler.CreateLocation)
		lr.With(auth.RequireRole(auth.RoleAdmin)).Patch("/{code}/status", mdHandler.UpdateLocationStatus)
		lr.With(auth.RequireRole(auth.RoleAdmin)).Put("/{code}", mdHandler.UpdateLocation)
	})
	r.Route("/api/tags", func(tr chi.Router) {
		tr.Use(authMw.Authenticate)
		tr.Get("/", mdHandler.ListTags)
		tr.With(auth.RequireRole(auth.RoleAdmin)).Get("/all", mdHandler.ListAllTags)
		tr.With(auth.RequireRole(auth.RoleAdmin)).Post("/", mdHandler.UpsertTag)
		tr.With(auth.RequireRole(auth.RoleAdmin)).Patch("/{code}/status", mdHandler.UpdateTagStatus)
		tr.With(auth.RequireRole(auth.RoleAdmin)).Post("/batch-status", mdHandler.BatchUpdateTagsStatus)
	})
}

func registerIssueRoutes(r *chi.Mux, queries *db.Queries, storageMgr *storage.Manager, authMw *auth.Middleware, notifyCh chan struct{}) {
	if storageMgr == nil {
		return
	}
	issueSvc := issue.NewService(queries, storageMgr, notifyCh)
	issueHandler := issue.NewHandler(issueSvc)

	r.Route("/api/issues", func(ir chi.Router) {
		ir.Use(authMw.Authenticate)
		ir.Get("/events", issueHandler.Events)
		ir.Get("/", issueHandler.List)
		ir.Post("/sync", issueHandler.Sync)
		ir.Get("/{id}", issueHandler.GetByID)
		ir.Post("/{id}/resolve", issueHandler.Resolve)
		ir.Post("/{id}/close", issueHandler.Close)
		ir.Post("/{id}/reopen", issueHandler.Reopen)
		ir.Post("/{id}/invalidate", issueHandler.Invalid)
		ir.Patch("/{id}", issueHandler.Patch)
	})

	reportSvc := report.NewService(queries)
	reportHandler := report.NewHandler(reportSvc)

	r.Route("/api/reports", func(rr chi.Router) {
		rr.Use(authMw.Authenticate)
		rr.Get("/summary", reportHandler.GetSummary)
	})

	// Allow CSV export under /api/issues/export
	r.With(authMw.Authenticate).Get("/api/issues/export", reportHandler.ExportCSV)
}

func registerScoringAndNotificationRoutes(r *chi.Mux, queries *db.Queries, authMw *auth.Middleware, cipher *crypto.Cipher, notifyCh chan struct{}, storageDir string) {
	scoringSvc := scoring.NewService(queries, nil)
	scoringHandler := scoring.NewHandler(scoringSvc)

	r.Route("/api/leaderboard", func(lbr chi.Router) {
		lbr.Use(authMw.Authenticate)
		lbr.Get("/locations", scoringHandler.GetLocationLeaderboard)
		lbr.Get("/reporters", scoringHandler.GetReporterLeaderboard)
		lbr.Get("/score-logs", scoringHandler.GetTargetScoreLogs)
	})

	r.Route("/api/issues/{id}/score-logs", func(ilr chi.Router) {
		ilr.Use(authMw.Authenticate)
		ilr.Get("/", scoringHandler.GetIssueScoreLogs)
	})

	r.Route("/api/config/scoring", func(scr chi.Router) {
		scr.Use(authMw.Authenticate)
		scr.Get("/", scoringHandler.GetRules)
		scr.With(auth.RequireRole(auth.RoleAdmin)).Put("/", scoringHandler.UpdateRules)
	})

	httpSender := notification.NewHTTPSender(cipher)
	notifHandler := notification.NewConfigHandler(queries, cipher, httpSender)
	r.Route("/api/config/notifications", func(nr chi.Router) {
		nr.Use(authMw.Authenticate)
		nr.Use(auth.RequireRole(auth.RoleAdmin))
		nr.Get("/", notifHandler.GetConfig)
		nr.Put("/", notifHandler.UpdateConfig)
		nr.Post("/test", notifHandler.TestConfig)
	})

	aiSvc := ai.NewService(queries, cipher, nil)
	aiHandler := ai.NewHandler(aiSvc)
	r.Route("/api/config/ai", func(air chi.Router) {
		air.Use(authMw.Authenticate)
		air.Use(auth.RequireRole(auth.RoleAdmin))
		air.Get("/", aiHandler.GetConfig)
		air.Put("/", aiHandler.UpdateConfig)
		air.Post("/test", aiHandler.TestConnection)
		air.Post("/test-dns", aiHandler.TestDNS)
	})

	r.Route("/api/ai", func(air chi.Router) {
		air.Use(authMw.Authenticate)
		air.Post("/translate", aiHandler.Translate)
	})

	// Launch background workers
	outboxWorker := notification.NewWorker(queries, httpSender, cipher, notifyCh)
	go outboxWorker.Start(context.Background())

	cronRunner := cron.NewRunner(queries, nil, storageDir)
	go cronRunner.Start(context.Background())
}
