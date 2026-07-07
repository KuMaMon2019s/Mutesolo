package webapp

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SQLiteBootstrapOptions controls the one-time JSON -> SQLite migration bootstrap.
type SQLiteBootstrapOptions struct {
	DBPath               string
	SchemaPath           string
	MigrationScriptPath   string
	WebStatePath         string
	LegacyWebStatePath   string
	CoordStatePath       string
	LegacyCoordStatePath string
	AutoMigrate          bool
}

// EnsureSQLiteInitialized makes sure the SQLite file exists before the server starts.
// It is conservative: if the database already exists and is non-empty, it does nothing.
// If the database is missing or empty, it runs the JSON -> SQLite migration script.
func EnsureSQLiteInitialized(opts SQLiteBootstrapOptions) error {
	if !opts.AutoMigrate {
		return nil
	}

	dbPath := strings.TrimSpace(opts.DBPath)
	if dbPath == "" {
		return nil
	}

	if info, err := os.Stat(dbPath); err == nil {
		if info.Size() > 0 {
			return nil
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat sqlite db: %w", err)
	}

	schemaPath := strings.TrimSpace(opts.SchemaPath)
	scriptPath := strings.TrimSpace(opts.MigrationScriptPath)
	if schemaPath == "" || scriptPath == "" {
		return fmt.Errorf("schema and migration script paths are required")
	}
	if _, err := os.Stat(schemaPath); err != nil {
		return fmt.Errorf("stat sqlite schema: %w", err)
	}
	if _, err := os.Stat(scriptPath); err != nil {
		return fmt.Errorf("stat migration script: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return fmt.Errorf("create sqlite directory: %w", err)
	}

	args := []string{
		scriptPath,
		"--db", dbPath,
		"--schema", schemaPath,
	}
	if v := strings.TrimSpace(opts.WebStatePath); v != "" {
		args = append(args, "--web-state", v)
	}
	if v := strings.TrimSpace(opts.LegacyWebStatePath); v != "" {
		args = append(args, "--legacy-web-state", v)
	}
	if v := strings.TrimSpace(opts.CoordStatePath); v != "" {
		args = append(args, "--coord-state", v)
	}
	if v := strings.TrimSpace(opts.LegacyCoordStatePath); v != "" {
		args = append(args, "--legacy-coord-state", v)
	}

	cmd := exec.Command("python3", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("run sqlite migration: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}
