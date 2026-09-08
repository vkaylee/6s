package config

import (
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// MinJWTSecretLen is the minimum accepted JWT HMAC secret length in bytes.
// 32 bytes matches the HS256 output size (RFC 7518 §3.2 key requirements).
const MinJWTSecretLen = 32

// Config holds the system runtime configuration loaded from env or CLI flags.
type Config struct {
	Port           string
	DBDSN          string
	DataDir        string
	EncryptionKey  string
	TLSCert        string
	TLSKey         string
	JWTSecret      string
	TrustedProxies string
	DevInsecure    bool
}

// Load parses configuration options from CLI arguments and environment
// variables, then validates required security-critical settings. Missing or
// invalid DB_DSN, JWT_SECRET, or a partial TLS cert/key pair fails closed.
func Load(args []string) (*Config, error) {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)

	port := fs.String("port", getEnv("SERVER_PORT", "8080"), "Server HTTP/HTTPS port")
	dbDSN := fs.String("db-dsn", getEnv("DB_DSN", ""), "PostgreSQL DSN (required; use sslmode=require or stronger)")
	dataDir := fs.String("data-dir", getEnv("DATA_DIR", "./data"), "Path to data and uploads directory")
	encKey := fs.String("encryption-key", getEnv("APP_ENCRYPTION_KEY", ""), "Base64 encoded 32-byte master encryption key")
	tlsCert := fs.String("tls-cert", getEnv("TLS_CERT", ""), "Path to TLS cert file (requires -tls-key)")
	tlsKey := fs.String("tls-key", getEnv("TLS_KEY", ""), "Path to TLS private key file (requires -tls-cert)")
	jwtSecret := fs.String("jwt-secret", getEnv("JWT_SECRET", ""), "JWT HMAC signing secret (required, min 32 bytes)")
	trustedProxies := fs.String("trusted-proxies", getEnv("TRUSTED_PROXIES", "127.0.0.1"), "Comma-separated trusted proxy IPs")
	devInsecure := fs.Bool("dev-insecure", os.Getenv("DEV_INSECURE") != "", "Allow plaintext DB DSN and plain HTTP for local development only")

	if err := fs.Parse(args); err != nil {
		return nil, err
	}

	cfg := &Config{
		Port:           *port,
		DBDSN:          *dbDSN,
		DataDir:        *dataDir,
		EncryptionKey:  *encKey,
		TLSCert:        *tlsCert,
		TLSKey:         *tlsKey,
		JWTSecret:      *jwtSecret,
		TrustedProxies: *trustedProxies,
		DevInsecure:    *devInsecure,
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// validate enforces fail-closed rules for security-critical settings.
func (c *Config) validate() error {
	var errs []error

	if strings.TrimSpace(c.DBDSN) == "" {
		errs = append(errs, errors.New("DB_DSN is required: set the DB_DSN environment variable or pass -db-dsn"))
	} else if !c.DevInsecure && isPlaintextPostgresDSN(c.DBDSN) {
		errs = append(errs, fmt.Errorf("DB_DSN must not connect over plaintext Postgres: use sslmode=require (or verify-full); set DEV_INSECURE=1 only for local development"))
	}

	switch {
	case c.JWTSecret == "":
		errs = append(errs, errors.New("JWT_SECRET is required: set the JWT_SECRET environment variable or pass -jwt-secret"))
	case len(c.JWTSecret) < MinJWTSecretLen:
		errs = append(errs, fmt.Errorf("JWT_SECRET must be at least %d bytes (got %d)", MinJWTSecretLen, len(c.JWTSecret)))
	}

	if (c.TLSCert == "") != (c.TLSKey == "") {
		errs = append(errs, errors.New("TLS_CERT and TLS_KEY must be provided together"))
	}

	return errors.Join(errs...)
}

// isPlaintextPostgresDSN reports whether the DSN is a URL-form Postgres
// connection string with encryption disabled, preferred-not-required, or
// downgradable. Keyword-form DSNs are left to the driver's sslmode handling.
func isPlaintextPostgresDSN(dsn string) bool {
	u, err := url.Parse(dsn)
	if err != nil {
		return false
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return false
	}
	switch u.Query().Get("sslmode") {
	case "", "disable", "prefer", "allow":
		return true
	}
	return false
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
