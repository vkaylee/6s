package main

import (
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"6s/internal/storage"
	"6s/web"
)

// registerStaticRoutes sets up SPA fallback, certificate serving, and optional dev uploads.
func registerStaticRoutes(r *chi.Mux, storageDir string, allowLegacyUploads bool) {
	if allowLegacyUploads && storageDir != "" {
		if manager, err := storage.NewManager(storageDir); err == nil {
			fileServer := http.StripPrefix("/uploads", manager.FileServer())
			r.Get("/uploads/*", func(w http.ResponseWriter, req *http.Request) {
				path := strings.TrimPrefix(req.URL.Path, "/uploads/")
				parts := strings.Split(path, "/")
				if len(parts) != 2 || (parts[0] != "before" && parts[0] != "detail" && parts[0] != "after") || parts[1] == "" || parts[1] == "." || parts[1] == ".." || strings.Contains(parts[1], `\`) {
					http.NotFound(w, req)
					return
				}
				fileServer.ServeHTTP(w, req)
			})
		} else {
			log.Printf("Warning: failed to init legacy uploads server: %v", err)
		}
	}

	// Serve Root CA certificate if exists (SPEC.md Section 10.1)
	r.Get("/cert/ca.crt", func(w http.ResponseWriter, req *http.Request) {
		http.ServeFile(w, req, "cert/ca.crt")
	})

	embeddedFS, err := web.GetFS()
	if err != nil {
		return
	}

	fileServer := http.FileServer(http.FS(embeddedFS))
	r.Get("/*", spaHandler(embeddedFS, fileServer))
}

func spaHandler(embeddedFS fs.FS, fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		path := strings.TrimPrefix(req.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		if serveExistingFile(w, req, embeddedFS, fileServer, path) {
			return
		}

		if serveSPAFallback(w, req, embeddedFS, fileServer) {
			return
		}

		http.NotFound(w, req)
	}
}

func serveExistingFile(w http.ResponseWriter, req *http.Request, embeddedFS fs.FS, fileServer http.Handler, path string) bool {
	f, err := embeddedFS.Open(path)
	if err != nil {
		return false
	}
	if cErr := f.Close(); cErr != nil {
		log.Printf("close embedded file err: %v", cErr)
	}
	if path == "sw.js" {
		w.Header().Set("Service-Worker-Allowed", "/")
		w.Header().Set("Content-Type", "application/javascript")
	} else if path == "manifest.webmanifest" {
		w.Header().Set("Content-Type", "application/manifest+json")
	}
	fileServer.ServeHTTP(w, req)
	return true
}

func serveSPAFallback(w http.ResponseWriter, req *http.Request, embeddedFS fs.FS, fileServer http.Handler) bool {
	if strings.HasPrefix(req.URL.Path, "/api") || strings.HasPrefix(req.URL.Path, "/uploads") {
		return false
	}

	indexFile, err := embeddedFS.Open("index.html")
	if err != nil {
		return false
	}
	if cErr := indexFile.Close(); cErr != nil {
		log.Printf("close index file err: %v", cErr)
	}
	req.URL.Path = "/"
	fileServer.ServeHTTP(w, req)
	return true
}
