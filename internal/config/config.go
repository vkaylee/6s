package config

import (
	"flag"
	"os"
)

// Config holds the system runtime configuration loaded from env or CLI flags.
type Config struct {
	Port          string
	DBDSN         string
	DataDir       string
	EncryptionKey string
	TLSCert       string
	TLSKey        string
}

// Load parses configuration options from CLI arguments and environment variables.
func Load(args []string) (*Config, error) {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)

	port := fs.String("port", getEnv("SERVER_PORT", "8080"), "Server HTTP/HTTPS port")
	dbDSN := fs.String("db-dsn", getEnv("DB_DSN", "postgres://postgres:postgres@localhost:5432/6s_db?sslmode=disable"), "PostgreSQL DSN")
	dataDir := fs.String("data-dir", getEnv("DATA_DIR", "./data"), "Path to data and uploads directory")
	encKey := fs.String("encryption-key", getEnv("APP_ENCRYPTION_KEY", ""), "Base64 encoded 32-byte master encryption key")
	tlsCert := fs.String("tls-cert", getEnv("TLS_CERT", ""), "Path to TLS cert file")
	tlsKey := fs.String("tls-key", getEnv("TLS_KEY", ""), "Path to TLS private key file")

	if err := fs.Parse(args); err != nil {
		return nil, err
	}

	return &Config{
		Port:          *port,
		DBDSN:         *dbDSN,
		DataDir:       *dataDir,
		EncryptionKey: *encKey,
		TLSCert:       *tlsCert,
		TLSKey:        *tlsKey,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
