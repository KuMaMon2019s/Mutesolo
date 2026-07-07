package webapp

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// SQLiteStore implements Repository by reading/writing a local SQLite database.
// The schema is defined in schema.sql at the repository root.
type SQLiteStore struct {
	db  *sql.DB
	path string
}

// NewSQLiteStore opens (or creates) the SQLite database at dbPath and ensures
// the schema exists. The caller must call Close when done.
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite dir: %w", err)
	}
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return &SQLiteStore{db: db, path: dbPath}, nil
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// ---------------------------------------------------------------------------
// Load – reconstruct State from SQLite tables
// ---------------------------------------------------------------------------

func (s *SQLiteStore) Load() (State, error) {
	config, err := s.loadConfig()
	if err != nil {
		return State{}, fmt.Errorf("load config: %w", err)
	}
	projects, err := s.loadProjects()
	if err != nil {
		return State{}, fmt.Errorf("load projects: %w", err)
	}
	state := State{
		Config:   config,
		Projects: projects,
	}
	ensureStateDefaults(&state)
	return state, nil
}

func (s *SQLiteStore) loadConfig() (Config, error) {
	rows, err := s.db.Query("SELECT key, value FROM config")
	if err != nil {
		return Config{}, err
	}
	defer rows.Close()

	kv := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return Config{}, err
		}
		kv[k] = v
	}
	if err := rows.Err(); err != nil {
		return Config{}, err
	}

	cfg := Config{
		AIAgentBaseURL:     kv["ai_agent_base_url"],
		AIAgentToken:       kv["ai_agent_token"],
		DiscordURL:         kv["discord_url"],
		DiscordWidgetURL:   kv["discord_widget_url"],
		DiscordBotID:       kv["discord_bot_id"],
		DiscordGuildID:     kv["discord_guild_id"],
		DiscordBotUsername: kv["discord_bot_username"],
		GitHubRepo:         kv["github_repo"],
		ClawHubBaseURL:     kv["clawhub_base_url"],
		LLMAPIKey:          kv["llm_api_key"],
	}
	if kv["llm_locked"] == "true" {
		cfg.LLMLocked = true
	}
	return cfg, nil
}

func (s *SQLiteStore) loadProjects() ([]Project, error) {
	projectRows, err := s.db.Query("SELECT id, name, description, plan, docs, created_at, updated_at FROM projects ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer projectRows.Close()

	var projects []Project
	for projectRows.Next() {
		var p Project
		var createdAt, updatedAt string
		if err := projectRows.Scan(&p.ID, &p.Name, &p.Description, &p.Plan, &p.Docs, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		p.CreatedAt, _ = time.Parse(timeLayout, createdAt)
		p.UpdatedAt, _ = time.Parse(timeLayout, updatedAt)

		branches, err := s.loadBranches(p.ID)
		if err != nil {
			return nil, err
		}
		p.Branches = branches

		requirements, err := s.loadRequirements(p.ID)
		if err != nil {
			return nil, err
		}
		p.Requirements = requirements

		projects = append(projects, p)
	}
	if err := projectRows.Err(); err != nil {
		return nil, err
	}
	if projects == nil {
		projects = []Project{}
	}
	return projects, nil
}

func (s *SQLiteStore) loadBranches(projectID string) ([]ProjectBranch, error) {
	rows, err := s.db.Query("SELECT id, name, created_at FROM branches WHERE project_id = ? ORDER BY created_at", projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []ProjectBranch
	for rows.Next() {
		var b ProjectBranch
		var createdAt string
		if err := rows.Scan(&b.ID, &b.Name, &createdAt); err != nil {
			return nil, err
		}
		b.CreatedAt, _ = time.Parse(timeLayout, createdAt)
		branches = append(branches, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return branches, nil
}

func (s *SQLiteStore) loadRequirements(projectID string) ([]Requirement, error) {
	rows, err := s.db.Query(
		"SELECT id, branch_id, title, description, priority, status, agent_id, prompt, commit_id, created_at, updated_at FROM requirements WHERE project_id = ? ORDER BY created_at",
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reqs []Requirement
	for rows.Next() {
		var r Requirement
		var createdAt, updatedAt string
		if err := rows.Scan(&r.ID, &r.BranchID, &r.Title, &r.Description, &r.Priority, &r.Status, &r.AgentID, &r.Prompt, &r.CommitID, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		r.CreatedAt, _ = time.Parse(timeLayout, createdAt)
		r.UpdatedAt, _ = time.Parse(timeLayout, updatedAt)
		reqs = append(reqs, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return reqs, nil
}

// ---------------------------------------------------------------------------
// Save – write full State into SQLite inside a transaction
// ---------------------------------------------------------------------------

func (s *SQLiteStore) Save(state State) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if err := s.saveConfig(tx, state.Config); err != nil {
		return fmt.Errorf("save config: %w", err)
	}
	if err := s.saveProjects(tx, state.Projects); err != nil {
		return fmt.Errorf("save projects: %w", err)
	}
	return tx.Commit()
}

func (s *SQLiteStore) saveConfig(tx *sql.Tx, cfg Config) error {
	pairs := map[string]string{
		"ai_agent_base_url":     cfg.AIAgentBaseURL,
		"ai_agent_token":        cfg.AIAgentToken,
		"discord_url":           cfg.DiscordURL,
		"discord_widget_url":    cfg.DiscordWidgetURL,
		"discord_bot_id":        cfg.DiscordBotID,
		"discord_guild_id":      cfg.DiscordGuildID,
		"discord_bot_username":  cfg.DiscordBotUsername,
		"github_repo":           cfg.GitHubRepo,
		"clawhub_base_url":      cfg.ClawHubBaseURL,
		"llm_api_key":           cfg.LLMAPIKey,
		"llm_locked":            fmt.Sprintf("%v", cfg.LLMLocked),
	}
	for k, v := range pairs {
		_, err := tx.Exec(
			"INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
			k, v, time.Now().UTC().Format(timeLayout),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) saveProjects(tx *sql.Tx, projects []Project) error {
	// Track which project IDs exist in the new state so we can clean up stale rows.
	newProjectIDs := make(map[string]bool, len(projects))
	for _, p := range projects {
		newProjectIDs[p.ID] = true
		_, err := tx.Exec(
			`INSERT INTO projects (id, name, description, plan, docs, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, plan=excluded.plan, docs=excluded.docs, updated_at=excluded.updated_at`,
			p.ID, p.Name, p.Description, p.Plan, p.Docs,
			p.CreatedAt.Format(timeLayout), p.UpdatedAt.Format(timeLayout),
		)
		if err != nil {
			return err
		}
		if err := s.saveBranches(tx, p.ID, p.Branches); err != nil {
			return err
		}
		if err := s.saveRequirements(tx, p.ID, p.Requirements); err != nil {
			return err
		}
	}
	// Remove projects that no longer exist in state.
	allRows, err := tx.Query("SELECT id FROM projects")
	if err != nil {
		return err
	}
	defer allRows.Close()
	for allRows.Next() {
		var id string
		if err := allRows.Scan(&id); err != nil {
			return err
		}
		if !newProjectIDs[id] {
			if _, err := tx.Exec("DELETE FROM projects WHERE id = ?", id); err != nil {
				return err
			}
		}
	}
	return allRows.Err()
}

func (s *SQLiteStore) saveBranches(tx *sql.Tx, projectID string, branches []ProjectBranch) error {
	// Clear old branches for this project and re-insert.
	if _, err := tx.Exec("DELETE FROM branches WHERE project_id = ?", projectID); err != nil {
		return err
	}
	for _, b := range branches {
		_, err := tx.Exec(
			"INSERT INTO branches (id, project_id, name, created_at) VALUES (?, ?, ?, ?)",
			b.ID, projectID, b.Name, b.CreatedAt.Format(timeLayout),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) saveRequirements(tx *sql.Tx, projectID string, requirements []Requirement) error {
	// Clear old requirements for this project and re-insert.
	if _, err := tx.Exec("DELETE FROM requirements WHERE project_id = ?", projectID); err != nil {
		return err
	}
	for _, r := range requirements {
		_, err := tx.Exec(
			`INSERT INTO requirements (id, project_id, branch_id, title, description, priority, status, agent_id, prompt, commit_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			r.ID, projectID, r.BranchID, r.Title, r.Description, r.Priority, r.Status, r.AgentID, r.Prompt, r.CommitID,
			r.CreatedAt.Format(timeLayout), r.UpdatedAt.Format(timeLayout),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

const timeLayout = "2006-01-02 15:04:05"
