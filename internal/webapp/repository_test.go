package webapp

import (
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// Repository conformance tests – run the same checks against every backend.
// ---------------------------------------------------------------------------

func testRepositoryLoadSave(t *testing.T, repo Repository) {
	t.Helper()

	// First load should return a valid (possibly empty) state.
	state, err := repo.Load()
	if err != nil {
		t.Fatalf("initial Load: %v", err)
	}
	if state.Projects == nil {
		t.Fatal("Projects should not be nil after Load")
	}

	// Mutate config and save.
	state.Config.AIAgentBaseURL = "http://test:9999"
	state.Config.GitHubRepo = "owner/repo"
	state.Config.LLMLocked = true
	if err := repo.Save(state); err != nil {
		t.Fatalf("Save config: %v", err)
	}

	// Reload and verify config persisted.
	reloaded, err := repo.Load()
	if err != nil {
		t.Fatalf("reload Load: %v", err)
	}
	if reloaded.Config.AIAgentBaseURL != "http://test:9999" {
		t.Fatalf("ai_agent_base_url = %q, want http://test:9999", reloaded.Config.AIAgentBaseURL)
	}
	if reloaded.Config.GitHubRepo != "owner/repo" {
		t.Fatalf("github_repo = %q, want owner/repo", reloaded.Config.GitHubRepo)
	}
	if !reloaded.Config.LLMLocked {
		t.Fatal("llm_locked should be true")
	}
}

func testRepositoryProjectsAndRequirements(t *testing.T, repo Repository) {
	t.Helper()

	state, _ := repo.Load()

	// Create a project.
	project := UpsertProject(&state, Project{Name: "Test Project"})
	if project.ID == "" {
		t.Fatal("project ID should not be empty")
	}
	if len(project.Branches) != 1 || project.Branches[0].ID != "main" {
		t.Fatal("new project should have a main branch")
	}
	if err := repo.Save(state); err != nil {
		t.Fatalf("Save project: %v", err)
	}

	// Reload and verify project persisted.
	reloaded, err := repo.Load()
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if len(reloaded.Projects) != 1 {
		t.Fatalf("projects count = %d, want 1", len(reloaded.Projects))
	}
	if reloaded.Projects[0].Name != "Test Project" {
		t.Fatalf("project name = %q, want Test Project", reloaded.Projects[0].Name)
	}
	if len(reloaded.Projects[0].Branches) != 1 {
		t.Fatalf("branches count = %d, want 1", len(reloaded.Projects[0].Branches))
	}

	// Add a requirement.
	req, ok := AddRequirement(&reloaded, reloaded.Projects[0].ID, Requirement{Title: "First req"})
	if !ok {
		t.Fatal("AddRequirement returned false")
	}
	if req.Priority != "low" {
		t.Fatalf("default priority = %q, want low", req.Priority)
	}
	if req.AgentID != "ai-agent-a" {
		t.Fatalf("default agent = %q, want ai-agent-a", req.AgentID)
	}
	if req.Status != "draft" {
		t.Fatalf("default status = %q, want draft", req.Status)
	}
	if err := repo.Save(reloaded); err != nil {
		t.Fatalf("Save requirement: %v", err)
	}

	// Reload and verify requirement persisted.
	final, err := repo.Load()
	if err != nil {
		t.Fatalf("final reload: %v", err)
	}
	if len(final.Projects[0].Requirements) != 1 {
		t.Fatalf("requirements count = %d, want 1", len(final.Projects[0].Requirements))
	}
	if final.Projects[0].Requirements[0].Title != "First req" {
		t.Fatalf("requirement title = %q, want First req", final.Projects[0].Requirements[0].Title)
	}
}

func testRepositoryBoardUpdate(t *testing.T, repo Repository) {
	t.Helper()

	state, _ := repo.Load()
	project := UpsertProject(&state, Project{Name: "Board"})
	branch, _ := AddBranch(&state, project.ID, "feature")
	req1, _ := AddRequirement(&state, project.ID, Requirement{Title: "R1", Status: "draft"})
	req2, _ := AddRequirement(&state, project.ID, Requirement{Title: "R2", Status: "draft"})
	_ = req2
	if err := repo.Save(state); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Reload, do board update, save.
	loaded, _ := repo.Load()
	updated, ok := UpdateRequirements(&loaded, project.ID, BoardUpdate{
		RequirementIDs: []string{req1.ID},
		BranchID:       branch.ID,
		Status:         "in_progress",
	})
	if !ok {
		t.Fatal("UpdateRequirements returned false")
	}
	if len(updated) != 1 {
		t.Fatalf("updated count = %d, want 1", len(updated))
	}
	if updated[0].Status != "in_progress" {
		t.Fatalf("status = %q, want in_progress", updated[0].Status)
	}
	if updated[0].BranchID != branch.ID {
		t.Fatalf("branch = %q, want %q", updated[0].BranchID, branch.ID)
	}
	if err := repo.Save(loaded); err != nil {
		t.Fatalf("Save after update: %v", err)
	}

	// Verify persistence.
	verify, _ := repo.Load()
	p, _ := FindProject(verify, project.ID)
	r, _ := FindRequirement(p, req1.ID)
	if r.Status != "in_progress" {
		t.Fatalf("persisted status = %q, want in_progress", r.Status)
	}
}

// ---------------------------------------------------------------------------
// JSON backend
// ---------------------------------------------------------------------------

func TestJSONStoreLoadSave(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryLoadSave(t, repo)
}

func TestJSONStoreProjectsAndRequirements(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryProjectsAndRequirements(t, repo)
}

func TestJSONStoreBoardUpdate(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryBoardUpdate(t, repo)
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

func newTestSQLiteStore(t *testing.T) *SQLiteStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("NewSQLiteStore: %v", err)
	}
	t.Cleanup(func() { store.Close() })

	// Apply schema.
	schemaPath := filepath.Join(findRepoRoot(t), "schema.sql")
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read schema: %v", err)
	}
	if _, err := store.db.Exec(string(schema)); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	return store
}

func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find repo root")
		}
		dir = parent
	}
}

func TestSQLiteStoreLoadSave(t *testing.T) {
	repo := newTestSQLiteStore(t)
	testRepositoryLoadSave(t, repo)
}

func TestSQLiteStoreProjectsAndRequirements(t *testing.T) {
	repo := newTestSQLiteStore(t)
	testRepositoryProjectsAndRequirements(t, repo)
}

func TestSQLiteStoreBoardUpdate(t *testing.T) {
	repo := newTestSQLiteStore(t)
	testRepositoryBoardUpdate(t, repo)
}

// ---------------------------------------------------------------------------
// Server works through Repository interface
// ---------------------------------------------------------------------------

func TestServerWorksWithSQLite(t *testing.T) {
	store := newTestSQLiteStore(t)
	server := NewServer(store, "web")
	if server.Handler() == nil {
		t.Fatal("Handler returned nil")
	}
}

func TestServerWorksWithJSON(t *testing.T) {
	store := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	server := NewServer(store, "web")
	if server.Handler() == nil {
		t.Fatal("Handler returned nil")
	}
}
