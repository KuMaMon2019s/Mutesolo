package coordination

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

const coordTimeLayout = "2006-01-02 15:04:05"

// SQLiteStore implements Repository by reading/writing a local SQLite database.
// The schema is defined in schema.sql at the repository root.
type SQLiteStore struct {
	db   *sql.DB
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

// Close releases the underlying database connection.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// ---------------------------------------------------------------------------
// Load – reconstruct State from SQLite tables
// ---------------------------------------------------------------------------

func (s *SQLiteStore) Load() (State, error) {
	agents, err := s.load_agents()
	if err != nil {
		return State{}, fmt.Errorf("load agents: %w", err)
	}
	skills, err := s.load_skills()
	if err != nil {
		return State{}, fmt.Errorf("load skills: %w", err)
	}
	tasks, err := s.load_tasks()
	if err != nil {
		return State{}, fmt.Errorf("load tasks: %w", err)
	}
	sessions, err := s.load_sessions()
	if err != nil {
		return State{}, fmt.Errorf("load sessions: %w", err)
	}
	events, err := s.load_events()
	if err != nil {
		return State{}, fmt.Errorf("load events: %w", err)
	}
	return State{
		Agents:   agents,
		Skills:   skills,
		Tasks:    tasks,
		Sessions: sessions,
		Events:   events,
	}, nil
}

func (s *SQLiteStore) load_agents() ([]Agent, error) {
	rows, err := s.db.Query("SELECT id, address, status, skills_json FROM agents ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		var skillsJSON string
		if err := rows.Scan(&a.ID, &a.Address, &a.Status, &skillsJSON); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(skillsJSON), &a.Skills)
		agents = append(agents, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if agents == nil {
		agents = []Agent{}
	}
	return agents, nil
}

func (s *SQLiteStore) load_skills() ([]Skill, error) {
	rows, err := s.db.Query("SELECT id, capabilities_json, version FROM skills ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var skills []Skill
	for rows.Next() {
		var sk Skill
		var capsJSON string
		if err := rows.Scan(&sk.ID, &capsJSON, &sk.Version); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(capsJSON), &sk.Capabilities)
		skills = append(skills, sk)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if skills == nil {
		skills = []Skill{}
	}
	return skills, nil
}

func (s *SQLiteStore) load_tasks() ([]Task, error) {
	rows, err := s.db.Query("SELECT id, required_caps_json, status FROM tasks ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		var capsJSON string
		if err := rows.Scan(&t.ID, &capsJSON, &t.Status); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(capsJSON), &t.RequiredCaps)
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if tasks == nil {
		tasks = []Task{}
	}
	return tasks, nil
}

func (s *SQLiteStore) load_sessions() ([]Session, error) {
	rows, err := s.db.Query("SELECT id, agent_id, task_id, status FROM sessions ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var ss Session
		if err := rows.Scan(&ss.ID, &ss.AgentID, &ss.TaskID, &ss.Status); err != nil {
			return nil, err
		}
		sessions = append(sessions, ss)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if sessions == nil {
		sessions = []Session{}
	}
	return sessions, nil
}

func (s *SQLiteStore) load_events() ([]Event, error) {
	rows, err := s.db.Query("SELECT type, entity_id, payload_json, created_at FROM events ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var e Event
		var payloadJSON string
		var createdAt string
		if err := rows.Scan(&e.Type, &e.EntityID, &payloadJSON, &createdAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(payloadJSON), &e.Payload)
		e.Timestamp, _ = time.Parse(coordTimeLayout, createdAt)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if events == nil {
		events = []Event{}
	}
	return events, nil
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

	if err := s.save_agents(tx, state.Agents); err != nil {
		return fmt.Errorf("save agents: %w", err)
	}
	if err := s.save_skills(tx, state.Skills); err != nil {
		return fmt.Errorf("save skills: %w", err)
	}
	if err := s.save_tasks(tx, state.Tasks); err != nil {
		return fmt.Errorf("save tasks: %w", err)
	}
	if err := s.save_sessions(tx, state.Sessions); err != nil {
		return fmt.Errorf("save sessions: %w", err)
	}
	if err := s.save_events(tx, state.Events); err != nil {
		return fmt.Errorf("save events: %w", err)
	}
	return tx.Commit()
}

func (s *SQLiteStore) save_agents(tx *sql.Tx, agents []Agent) error {
	if _, err := tx.Exec("DELETE FROM agents"); err != nil {
		return err
	}
	for _, a := range agents {
		skillsJSON, _ := json.Marshal(a.Skills)
		_, err := tx.Exec(
			"INSERT INTO agents (id, address, status, skills_json, updated_at) VALUES (?, ?, ?, ?, ?)",
			a.ID, a.Address, string(a.Status), string(skillsJSON), time.Now().UTC().Format(coordTimeLayout),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) save_skills(tx *sql.Tx, skills []Skill) error {
	if _, err := tx.Exec("DELETE FROM skills"); err != nil {
		return err
	}
	for _, sk := range skills {
		capsJSON, _ := json.Marshal(sk.Capabilities)
		_, err := tx.Exec(
			"INSERT INTO skills (id, capabilities_json, version) VALUES (?, ?, ?)",
			sk.ID, string(capsJSON), sk.Version,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) save_tasks(tx *sql.Tx, tasks []Task) error {
	if _, err := tx.Exec("DELETE FROM tasks"); err != nil {
		return err
	}
	now := time.Now().UTC().Format(coordTimeLayout)
	for _, t := range tasks {
		capsJSON, _ := json.Marshal(t.RequiredCaps)
		_, err := tx.Exec(
			"INSERT INTO tasks (id, required_caps_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			t.ID, string(capsJSON), string(t.Status), now, now,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) save_sessions(tx *sql.Tx, sessions []Session) error {
	if _, err := tx.Exec("DELETE FROM sessions"); err != nil {
		return err
	}
	now := time.Now().UTC().Format(coordTimeLayout)
	for _, ss := range sessions {
		_, err := tx.Exec(
			"INSERT INTO sessions (id, task_id, agent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			ss.ID, ss.TaskID, ss.AgentID, string(ss.Status), now, now,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) save_events(tx *sql.Tx, events []Event) error {
	if _, err := tx.Exec("DELETE FROM events"); err != nil {
		return err
	}
	for _, e := range events {
		payloadJSON, _ := json.Marshal(e.Payload)
		_, err := tx.Exec(
			"INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?)",
			e.Type, e.EntityID, string(payloadJSON), e.Timestamp.Format(coordTimeLayout),
		)
		if err != nil {
			return err
		}
	}
	return nil
}
