package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

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

	server := webapp.NewServer(repo, *staticDir)
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
