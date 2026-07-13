package webapp

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	store := &SQLiteStore{db: db, path: dbPath}
	if err := store.ensureMembersTable(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensure members table: %w", err)
	}
	if err := store.ensureStatsTable(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensure stats table: %w", err)
	}
	if err := store.ensureProjectImagesTable(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensure project_images table: %w", err)
	}
	if err := store.ensureAssetRefsTable(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensure asset_refs table: %w", err)
	}
	if err := store.ensureUsersTable(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensure users table: %w", err)
	}
	if err := store.ensureBranchesPK(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensure branches PK: %w", err)
	}
	return store, nil
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// ensureBranchesPK migrates the branches table from composite PK (project_id, id)
// to single-column PK (id). This is required because SQLite foreign keys can only
// reference unique columns, and the old composite PK made branches.id non-unique.
func (s *SQLiteStore) ensureBranchesPK() error {
	// Check whether branches table exists and has the old composite PK.
	var createSQL string
	err := s.db.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='branches'").Scan(&createSQL)
	if err != nil {
		return nil // table doesn't exist yet — schema.sql will create it fresh
	}
	// If id is already the sole PK, nothing to do.
	if strings.Contains(createSQL, "PRIMARY KEY (id)") || strings.Contains(createSQL, "id TEXT PRIMARY KEY") {
		return nil
	}

	// Disable FK checks while we rebuild the table.
	if _, err := s.db.Exec("PRAGMA foreign_keys = OFF"); err != nil {
		return fmt.Errorf("disable FK: %w", err)
	}
	defer func() { s.db.Exec("PRAGMA foreign_keys = ON") }()

	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS branches_new (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		name TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
		UNIQUE(project_id, name)
	)`); err != nil {
		return fmt.Errorf("create branches_new: %w", err)
	}

	if _, err := s.db.Exec("INSERT INTO branches_new SELECT id, project_id, name, created_at FROM branches"); err != nil {
		return fmt.Errorf("copy branches: %w", err)
	}

	if _, err := s.db.Exec("DROP TABLE branches"); err != nil {
		return fmt.Errorf("drop old branches: %w", err)
	}

	if _, err := s.db.Exec("ALTER TABLE branches_new RENAME TO branches"); err != nil {
		return fmt.Errorf("rename branches_new: %w", err)
	}

	return nil
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
		ClawHubAPIKey:      kv["clawhub_api_key"],
		OpenCodeAPIKey:     kv["opencode_api_key"],
		ArkAPIKey:          kv["ark_api_key"],
		GitHubToken:        kv["github_token"],
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

	// Load cover URLs first so we can attach them.
	coverURLs, err := s.loadCoverURLs()
	if err != nil {
		return nil, err
	}

	var projects []Project
	for projectRows.Next() {
		var p Project
		var createdAt, updatedAt string
		if err := projectRows.Scan(&p.ID, &p.Name, &p.Description, &p.Plan, &p.Docs, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		p.CreatedAt, _ = time.Parse(timeLayout, createdAt)
		p.UpdatedAt, _ = time.Parse(timeLayout, updatedAt)

		if url, ok := coverURLs[p.ID]; ok {
			p.CoverURL = url
		}

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
		"SELECT id, branch_id, title, description, priority, status, agent_id, COALESCE(assigned_member, '') as assigned_member, prompt, commit_id, COALESCE(editor_content, '') as editor_content, COALESCE(attachments, '') as attachments, created_at, updated_at FROM requirements WHERE project_id = ? ORDER BY created_at",
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
		var editorContentRaw, attachmentsRaw string
		if err := rows.Scan(&r.ID, &r.BranchID, &r.Title, &r.Description, &r.Priority, &r.Status, &r.AgentID, &r.AssignedMember, &r.Prompt, &r.CommitID, &editorContentRaw, &attachmentsRaw, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		if editorContentRaw != "" {
			r.EditorContent = json.RawMessage(editorContentRaw)
		}
		if attachmentsRaw != "" {
			r.Attachments = json.RawMessage(attachmentsRaw)
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
	if err := s.rebuildStatsTx(tx, state); err != nil {
		return fmt.Errorf("rebuild stats: %w", err)
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
		"clawhub_api_key":       cfg.ClawHubAPIKey,
		"opencode_api_key":      cfg.OpenCodeAPIKey,
		"ark_api_key":           cfg.ArkAPIKey,
		"github_token":          cfg.GitHubToken,
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
		editorContentStr := ""
		if len(r.EditorContent) > 0 {
			editorContentStr = string(r.EditorContent)
		}
		attachmentsStr := ""
		if len(r.Attachments) > 0 {
			attachmentsStr = string(r.Attachments)
		}
		_, err := tx.Exec(
			`INSERT INTO requirements (id, project_id, branch_id, title, description, priority, status, agent_id, assigned_member, prompt, commit_id, editor_content, attachments, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			r.ID, projectID, r.BranchID, r.Title, r.Description, r.Priority, r.Status, r.AgentID, r.AssignedMember, r.Prompt, r.CommitID,
			editorContentStr, attachmentsStr,
			r.CreatedAt.Format(timeLayout), r.UpdatedAt.Format(timeLayout),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Members – dedicated load/save separate from full State
// ---------------------------------------------------------------------------

func (s *SQLiteStore) ensureMembersTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS members (
		username TEXT PRIMARY KEY,
		status TEXT NOT NULL DEFAULT 'online',
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	return err
}

// LoadMembers reads all members from the SQLite members table.
func (s *SQLiteStore) LoadMembers() ([]Member, error) {
	return s.loadMembers()
}

func (s *SQLiteStore) loadMembers() ([]Member, error) {
	rows, err := s.db.Query("SELECT username, status, updated_at FROM members ORDER BY username")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []Member
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.Username, &m.Status, &m.UpdatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if members == nil {
		members = []Member{}
	}
	return members, nil
}

// SaveMembers persists the full member list.
func (s *SQLiteStore) SaveMembers(members []Member) error {
	return s.saveMembers(members)
}

func (s *SQLiteStore) saveMembers(members []Member) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM members"); err != nil {
		return err
	}
	now := time.Now().UTC().Format(timeLayout)
	for _, m := range members {
		_, err := tx.Exec(
			"INSERT INTO members (username, status, updated_at) VALUES (?, ?, ?)",
			m.Username, m.Status, now,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

const timeLayout = "2006-01-02 15:04:05"

// ---------------------------------------------------------------------------
// Stats – pre-built member statistics
// ---------------------------------------------------------------------------

func (s *SQLiteStore) ensureStatsTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS stats (
		project_id TEXT NOT NULL,
		branch_id TEXT NOT NULL,
		member TEXT NOT NULL,
		status TEXT NOT NULL,
		count INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (project_id, branch_id, member, status)
	)`)
	return err
}

// ---------------------------------------------------------------------------
// Project Images – 1:1 cover image URL per project
// ---------------------------------------------------------------------------

func (s *SQLiteStore) ensureProjectImagesTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS project_images (
		project_id TEXT PRIMARY KEY,
		url TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`)
	return err
}

// loadCoverURLs returns a map of project_id → cover_url.
func (s *SQLiteStore) loadCoverURLs() (map[string]string, error) {
	rows, err := s.db.Query("SELECT project_id, url FROM project_images")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]string)
	for rows.Next() {
		var pid, url string
		if err := rows.Scan(&pid, &url); err != nil {
			return nil, err
		}
		m[pid] = url
	}
	return m, rows.Err()
}

// SaveProjectImage upserts a cover URL for the given project.
func (s *SQLiteStore) SaveProjectImage(projectID, url string) error {
	_, err := s.db.Exec(
		`INSERT INTO project_images (project_id, url, created_at) VALUES (?, ?, ?)
		 ON CONFLICT(project_id) DO UPDATE SET url = excluded.url`,
		projectID, url, time.Now().UTC().Format(timeLayout),
	)
	return err
}

// GetProjectImageURL returns the cover URL for a project.
func (s *SQLiteStore) GetProjectImageURL(projectID string) (string, bool, error) {
	var url string
	err := s.db.QueryRow("SELECT url FROM project_images WHERE project_id = ?", projectID).Scan(&url)
	if err != nil {
		return "", false, nil
	}
	return url, true, nil
}

// GetAllProjectIDs returns all project IDs (for migration).
func (s *SQLiteStore) GetAllProjectIDs() ([]string, error) {
	rows, err := s.db.Query("SELECT id FROM projects")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// RebuildStats recomputes the stats table from the current state.
func (s *SQLiteStore) RebuildStats(state State) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()
	if err := s.rebuildStatsTx(tx, state); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLiteStore) rebuildStatsTx(tx *sql.Tx, state State) error {
	if _, err := tx.Exec("DELETE FROM stats"); err != nil {
		return err
	}
	for _, project := range state.Projects {
		for _, req := range project.Requirements {
			member := strings.TrimSpace(req.AssignedMember)
			if member == "" {
				continue
			}
			branchID := req.BranchID
			if branchID == "" {
				branchID = "main"
			}
			status := req.Status
			if status == "" {
				status = "draft"
			}
			_, err := tx.Exec(
				`INSERT INTO stats (project_id, branch_id, member, status, count)
				 VALUES (?, ?, ?, ?, 1)
				 ON CONFLICT(project_id, branch_id, member, status)
				 DO UPDATE SET count = count + 1`,
				project.ID, branchID, member, status,
			)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

// LoadStats returns pre-built member statistics, optionally filtered.
func (s *SQLiteStore) LoadStats(projectID, branchID string) (StatsResponse, error) {
	var rows *sql.Rows
	var err error
	if projectID != "" && branchID != "" {
		rows, err = s.db.Query(
			"SELECT member, status, SUM(count) FROM stats WHERE project_id = ? AND branch_id = ? GROUP BY member, status ORDER BY member",
			projectID, branchID,
		)
	} else if projectID != "" {
		rows, err = s.db.Query(
			"SELECT member, status, SUM(count) FROM stats WHERE project_id = ? GROUP BY member, status ORDER BY member",
			projectID,
		)
	} else if branchID != "" {
		rows, err = s.db.Query(
			"SELECT member, status, SUM(count) FROM stats WHERE branch_id = ? GROUP BY member, status ORDER BY member",
			branchID,
		)
	} else {
		rows, err = s.db.Query(
			"SELECT member, status, SUM(count) FROM stats GROUP BY member, status ORDER BY member",
		)
	}
	if err != nil {
		return StatsResponse{}, err
	}
	defer rows.Close()

	memberMap := make(map[string]map[string]int)
	for rows.Next() {
		var member, status string
		var count int
		if err := rows.Scan(&member, &status, &count); err != nil {
			return StatsResponse{}, err
		}
		if _, ok := memberMap[member]; !ok {
			memberMap[member] = make(map[string]int)
		}
		memberMap[member][status] += count
	}
	if err := rows.Err(); err != nil {
		return StatsResponse{}, err
	}

	var stats StatsResponse
	for member, breakdown := range memberMap {
		total := 0
		for _, c := range breakdown {
			total += c
		}
		stats.Members = append(stats.Members, MemberStats{
			Username:        member,
			TaskCount:       total,
			StatusBreakdown: breakdown,
		})
	}
	return stats, nil
}

// ---------------------------------------------------------------------------
// Asset Refs – track uploaded assets for project/requirement cleanup
// ---------------------------------------------------------------------------

func (s *SQLiteStore) ensureAssetRefsTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS asset_refs (
		asset_id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		requirement_id TEXT NOT NULL DEFAULT '',
		storage_key TEXT NOT NULL,
		url TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`)
	return err
}

// SaveAssetRef persists an asset reference.
func (s *SQLiteStore) SaveAssetRef(ref AssetRef) error {
	_, err := s.db.Exec(
		`INSERT INTO asset_refs (asset_id, project_id, requirement_id, storage_key, url, source, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(asset_id) DO UPDATE SET project_id=excluded.project_id, requirement_id=excluded.requirement_id`,
		ref.AssetID, ref.ProjectID, ref.RequirementID, ref.StorageKey, ref.URL, ref.Source,
		time.Now().UTC().Format(timeLayout),
	)
	return err
}

// GetAssetRefsByProject returns all asset refs for a project.
func (s *SQLiteStore) GetAssetRefsByProject(projectID string) ([]AssetRef, error) {
	rows, err := s.db.Query(
		"SELECT asset_id, project_id, requirement_id, storage_key, url, source FROM asset_refs WHERE project_id = ?",
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var refs []AssetRef
	for rows.Next() {
		var r AssetRef
		if err := rows.Scan(&r.AssetID, &r.ProjectID, &r.RequirementID, &r.StorageKey, &r.URL, &r.Source); err != nil {
			return nil, err
		}
		refs = append(refs, r)
	}
	return refs, rows.Err()
}

// GetAssetRefsByRequirement returns all asset refs for a requirement.
func (s *SQLiteStore) GetAssetRefsByRequirement(projectID, requirementID string) ([]AssetRef, error) {
	rows, err := s.db.Query(
		"SELECT asset_id, project_id, requirement_id, storage_key, url, source FROM asset_refs WHERE project_id = ? AND requirement_id = ?",
		projectID, requirementID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var refs []AssetRef
	for rows.Next() {
		var r AssetRef
		if err := rows.Scan(&r.AssetID, &r.ProjectID, &r.RequirementID, &r.StorageKey, &r.URL, &r.Source); err != nil {
			return nil, err
		}
		refs = append(refs, r)
	}
	return refs, rows.Err()
}

// DeleteAssetRefsByRequirement removes all asset refs for a requirement.
func (s *SQLiteStore) DeleteAssetRefsByRequirement(projectID, requirementID string) error {
	_, err := s.db.Exec(
		"DELETE FROM asset_refs WHERE project_id = ? AND requirement_id = ?",
		projectID, requirementID,
	)
	return err
}

// DeleteAssetRefsByProject removes all asset refs for a project.
func (s *SQLiteStore) DeleteAssetRefsByProject(projectID string) error {
	_, err := s.db.Exec(
		"DELETE FROM asset_refs WHERE project_id = ?",
		projectID,
	)
	return err
}

// ---------------------------------------------------------------------------
// Users – GitHub OAuth users
// ---------------------------------------------------------------------------

func (s *SQLiteStore) ensureUsersTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	return err
}

// CreateUser creates a new user with hashed password.
func (s *SQLiteStore) CreateUser(username, passwordHash string) (User, error) {
	_, err := s.db.Exec(
		`INSERT INTO users (username, password_hash) VALUES (?, ?)`,
		username, passwordHash,
	)
	if err != nil {
		return User{}, err
	}
	return s.GetUserByUsername(username)
}

// GetUserByID returns a user by internal ID.
func (s *SQLiteStore) GetUserByID(id int64) (User, error) {
	var u User
	var createdAt string
	err := s.db.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE id = ?", id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &createdAt)
	if err != nil {
		return User{}, err
	}
	u.CreatedAt, _ = time.Parse(timeLayout, createdAt)
	return u, nil
}

// GetUserByUsername returns a user by username.
func (s *SQLiteStore) GetUserByUsername(username string) (User, error) {
	var u User
	var createdAt string
	err := s.db.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE username = ?", username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &createdAt)
	if err != nil {
		return User{}, err
	}
	u.CreatedAt, _ = time.Parse(timeLayout, createdAt)
	return u, nil
}

// UpdatePassword updates a user's password hash.
func (s *SQLiteStore) UpdatePassword(userID int64, passwordHash string) error {
	_, err := s.db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, userID)
	return err
}
