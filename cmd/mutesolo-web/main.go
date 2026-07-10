package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"Mutesolo/internal/storage"
	"Mutesolo/internal/webapp"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "listen address")
	staticDir := flag.String("static", "web", "static web directory")
	statePath := flag.String("state", webapp.DefaultStatePath(), "web state path (JSON backend)")
	dbPath := flag.String("db", ".ai-agent/mutesolo.db", "sqlite database path")
	schemaPath := flag.String("schema", "schema.sql", "sqlite schema path")
	migrateScriptPath := flag.String("migrate-script", "scripts/migrate_json_to_sqlite.py", "sqlite migration script path")
	autoMigrate := flag.Bool("auto-migrate", true, "auto initialize sqlite from JSON on startup")
	backend := flag.String("backend", "", "storage backend: sqlite (default) or json")
	minioEndpoint := flag.String("minio-endpoint", envOrDefault("MINIO_ENDPOINT", "127.0.0.1:9000"), "MinIO endpoint")
	minioAccessKey := flag.String("minio-access-key", envOrDefault("MINIO_ROOT_USER", "mutisolo"), "MinIO access key")
	minioSecretKey := flag.String("minio-secret-key", envOrDefault("MINIO_ROOT_PASSWORD", "mutisolo123"), "MinIO secret key")
	minioBucket := flag.String("minio-bucket", envOrDefault("MINIO_COVER_BUCKET", "mutesolo-covers"), "MinIO bucket for covers")
	minioSSL := flag.Bool("minio-ssl", false, "use SSL for MinIO")
	flag.Parse()

	// Resolve backend: explicit flag wins, otherwise auto-detect.
	chosen := resolveBackend(*backend, *dbPath)

	var repo webapp.Repository
	switch chosen {
	case "sqlite":
		if err := webapp.EnsureSQLiteInitialized(webapp.SQLiteBootstrapOptions{
			DBPath:               *dbPath,
			SchemaPath:           *schemaPath,
			MigrationScriptPath:   *migrateScriptPath,
			WebStatePath:         *statePath,
			LegacyWebStatePath:   ".openclaw/web-state.json",
			CoordStatePath:       ".ai-agent/state.json",
			LegacyCoordStatePath: ".openclaw/state.json",
			AutoMigrate:          *autoMigrate,
		}); err != nil {
			log.Printf("sqlite bootstrap skipped: %v", err)
		}
		sqliteStore, err := webapp.NewSQLiteStore(*dbPath)
		if err != nil {
			log.Fatalf("open sqlite store: %v", err)
		}
		defer sqliteStore.Close()
		repo = sqliteStore
		log.Printf("using sqlite backend: %s", *dbPath)
	default:
		repo = webapp.NewJSONStore(*statePath)
		log.Printf("using json backend: %s", *statePath)
	}

	// Initialize MinIO client.
	var minioClient *storage.Client
	minioClient, err := storage.NewClient(*minioEndpoint, *minioAccessKey, *minioSecretKey, *minioBucket, *minioSSL)
	if err != nil {
		log.Printf("minio init failed (covers disabled): %v", err)
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := minioClient.EnsureBucket(ctx); err != nil {
			log.Printf("minio ensure bucket failed (covers disabled): %v", err)
			cancel()
			minioClient = nil
		} else {
			cancel()
			log.Printf("minio ready: %s/%s", *minioEndpoint, *minioBucket)

			// Startup migration: migrate existing project covers (all backends).
		if state, err := repo.Load(); err == nil {
			runCoverMigration(repo, minioClient, state)
		} else {
			log.Printf("cover migration: load state: %v", err)
		}
		}
	}

	// Rebuild stats from existing state on startup.
	if state, err := repo.Load(); err == nil {
		if err := repo.RebuildStats(state); err != nil {
			log.Printf("initial stats rebuild: %v", err)
		}
	} else {
		log.Printf("load state for stats rebuild: %v", err)
	}

	server := webapp.NewServer(repo, *staticDir, minioClient)
	fmt.Printf("Mutesolo web console: http://%s\n", *addr)
	log.Fatal(http.ListenAndServe(*addr, server.Handler()))
}

func resolveBackend(explicit string, dbPath string) string {
	switch explicit {
	case "json":
		return "json"
	case "sqlite":
		return "sqlite"
	}
	// Auto-detect: if the SQLite file exists, prefer it; otherwise check if
	// there is a JSON state file and fall back to JSON.
	if _, err := os.Stat(dbPath); err == nil {
		return "sqlite"
	}
	jsonPath := webapp.DefaultStatePath()
	if _, err := os.Stat(jsonPath); err == nil {
		return "json"
	}
	// Default to SQLite for fresh installs.
	return "sqlite"
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
