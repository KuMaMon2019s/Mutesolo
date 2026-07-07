package coordination

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

	state, err := repo.Load()
	if err != nil {
		t.Fatalf("initial Load: %v", err)
	}
	if len(state.Agents) == 0 {
		t.Fatal("agents should not be empty after initial Load")
	}

	// Add a task via business logic and save.
	task, err := CreateTask(&state, "task-rt-1", []string{"code", "test"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if err := repo.Save(state); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Reload and verify task persisted.
	reloaded, err := repo.Load()
	if err != nil {
		t.Fatalf("reload Load: %v", err)
	}
	if len(reloaded.Tasks) != 1 {
		t.Fatalf("tasks count = %d, want 1", len(reloaded.Tasks))
	}
	if reloaded.Tasks[0].ID != task.ID {
		t.Fatalf("task id = %q, want %q", reloaded.Tasks[0].ID, task.ID)
	}
	if len(reloaded.Tasks[0].RequiredCaps) != 2 {
		t.Fatalf("required caps count = %d, want 2", len(reloaded.Tasks[0].RequiredCaps))
	}
}

func testRepositoryAgentsAndSkills(t *testing.T, repo Repository) {
	t.Helper()

	state, err := repo.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Initial state should have agents and skills.
	if len(state.Agents) < 3 {
		t.Fatalf("agents count = %d, want >= 3", len(state.Agents))
	}
	if len(state.Skills) < 5 {
		t.Fatalf("skills count = %d, want >= 5", len(state.Skills))
	}

	// Verify agent skills round-trip.
	found := false
	for _, a := range state.Agents {
		if a.ID == "agent-a" {
			found = true
			if len(a.Skills) != 3 {
				t.Fatalf("agent-a skills = %d, want 3", len(a.Skills))
			}
		}
	}
	if !found {
		t.Fatal("agent-a not found in state")
	}

	// Verify skill capabilities round-trip.
	foundSkill := false
	for _, sk := range state.Skills {
		if sk.ID == "skill-code" {
			foundSkill = true
			if len(sk.Capabilities) != 2 {
				t.Fatalf("skill-code capabilities = %d, want 2", len(sk.Capabilities))
			}
			if sk.Version != "0.1.0" {
				t.Fatalf("skill-code version = %q, want 0.1.0", sk.Version)
			}
		}
	}
	if !foundSkill {
		t.Fatal("skill-code not found in state")
	}
}

func testRepositoryMatchAndAssign(t *testing.T, repo Repository) {
	t.Helper()

	state, _ := repo.Load()

	// Match a task.
	task, _ := CreateTask(&state, "task-match", []string{"code", "test"})
	if err := repo.Save(state); err != nil {
		t.Fatalf("Save after create: %v", err)
	}

	loaded, _ := repo.Load()
	result, err := MatchTask(&loaded, task.ID)
	if err != nil {
		t.Fatalf("MatchTask: %v", err)
	}
	if result.Agent.ID != "agent-a" {
		t.Fatalf("matched agent = %q, want agent-a", result.Agent.ID)
	}
	if err := repo.Save(loaded); err != nil {
		t.Fatalf("Save after match: %v", err)
	}

	// Assign the task.
	loaded2, _ := repo.Load()
	session, err := AssignTask(&loaded2, task.ID, "agent-a")
	if err != nil {
		t.Fatalf("AssignTask: %v", err)
	}
	if session.TaskID != task.ID {
		t.Fatalf("session task = %q, want %q", session.TaskID, task.ID)
	}
	if err := repo.Save(loaded2); err != nil {
		t.Fatalf("Save after assign: %v", err)
	}

	// Verify final state.
	final, _ := repo.Load()
	if len(final.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(final.Sessions))
	}
	if final.Sessions[0].AgentID != "agent-a" {
		t.Fatalf("session agent = %q, want agent-a", final.Sessions[0].AgentID)
	}
}

func testRepositoryEventsRoundTrip(t *testing.T, repo Repository) {
	t.Helper()

	state, _ := repo.Load()
	initialEventCount := len(state.Events)

	CreateTask(&state, "task-ev", []string{"code"})
	if err := repo.Save(state); err != nil {
		t.Fatalf("Save: %v", err)
	}

	reloaded, _ := repo.Load()
	if len(reloaded.Events) <= initialEventCount {
		t.Fatalf("events count = %d, want > %d", len(reloaded.Events), initialEventCount)
	}

	lastEvent := reloaded.Events[len(reloaded.Events)-1]
	if lastEvent.Type != "task.created" {
		t.Fatalf("last event type = %q, want task.created", lastEvent.Type)
	}
	if lastEvent.EntityID != "task-ev" {
		t.Fatalf("last event entity = %q, want task-ev", lastEvent.EntityID)
	}
}

func testWithStateHelper(t *testing.T, repo Repository) {
	t.Helper()

	err := WithState(repo, func(state *State) (bool, error) {
		_, err := CreateTask(state, "task-ws", []string{"ops"})
		return err == nil, err
	})
	if err != nil {
		t.Fatalf("WithState: %v", err)
	}

	state, _ := repo.Load()
	if findTaskIndex(state, "task-ws") < 0 {
		t.Fatal("task-ws was not saved via WithState")
	}
}

// ---------------------------------------------------------------------------
// JSON backend
// ---------------------------------------------------------------------------

func TestJSONStoreLoadSave(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryLoadSave(t, repo)
}

func TestJSONStoreAgentsAndSkills(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryAgentsAndSkills(t, repo)
}

func TestJSONStoreMatchAndAssign(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryMatchAndAssign(t, repo)
}

func TestJSONStoreEventsRoundTrip(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testRepositoryEventsRoundTrip(t, repo)
}

func TestJSONStoreWithState(t *testing.T) {
	repo := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	testWithStateHelper(t, repo)
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

// initSQLiteWithInitialState seeds the SQLite store with InitialState so
// business logic tests have agents and skills to work with.
func initSQLiteWithInitialState(t *testing.T, store *SQLiteStore) {
	t.Helper()
	if err := store.Save(InitialState()); err != nil {
		t.Fatalf("seed initial state: %v", err)
	}
}

func TestSQLiteStoreLoadSave(t *testing.T) {
	repo := newTestSQLiteStore(t)
	initSQLiteWithInitialState(t, repo)
	testRepositoryLoadSave(t, repo)
}

func TestSQLiteStoreAgentsAndSkills(t *testing.T) {
	repo := newTestSQLiteStore(t)
	initSQLiteWithInitialState(t, repo)
	testRepositoryAgentsAndSkills(t, repo)
}

func TestSQLiteStoreMatchAndAssign(t *testing.T) {
	repo := newTestSQLiteStore(t)
	initSQLiteWithInitialState(t, repo)
	testRepositoryMatchAndAssign(t, repo)
}

func TestSQLiteStoreEventsRoundTrip(t *testing.T) {
	repo := newTestSQLiteStore(t)
	initSQLiteWithInitialState(t, repo)
	testRepositoryEventsRoundTrip(t, repo)
}

func TestSQLiteStoreWithState(t *testing.T) {
	repo := newTestSQLiteStore(t)
	initSQLiteWithInitialState(t, repo)
	testWithStateHelper(t, repo)
}
