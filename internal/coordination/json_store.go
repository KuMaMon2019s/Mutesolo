package coordination

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// JSONStore implements Repository by reading/writing a single JSON file.
// It preserves the original file-based behaviour and serves as the fallback
// backend when SQLite is not available.
type JSONStore struct {
	path string
}

// NewJSONStore creates a JSON-file-backed repository.
func NewJSONStore(path string) *JSONStore {
	return &JSONStore{path: path}
}

// NewStore keeps the old constructor name for backward compatibility.
func NewStore(path string) *JSONStore {
	return NewJSONStore(path)
}

// DefaultStatePath returns the default JSON state file path.
func DefaultStatePath() string {
	if path := os.Getenv("AI_AGENT_STATE"); path != "" {
		return path
	}
	return ".ai-agent/state.json"
}

// DefaultDBPath returns the default SQLite database path.
func DefaultDBPath() string {
	if path := os.Getenv("AI_AGENT_DB"); path != "" {
		return path
	}
	return ".ai-agent/coordination.db"
}

func (s *JSONStore) Load() (State, error) {
	data, err := os.ReadFile(s.path)
	if err == nil {
		var state State
		if err := json.Unmarshal(data, &state); err != nil {
			return State{}, fmt.Errorf("decode state: %w", err)
		}
		return state, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return State{}, fmt.Errorf("read state: %w", err)
	}

	state := InitialState()
	if err := s.Save(state); err != nil {
		return State{}, err
	}
	return state, nil
}

func (s *JSONStore) Save(state State) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode state: %w", err)
	}
	tmpPath := s.path + ".tmp"
	if err := os.WriteFile(tmpPath, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write state: %w", err)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		return fmt.Errorf("replace state: %w", err)
	}
	return nil
}

// WithState performs a file-lock-protected read-modify-write on the JSON store.
// This is kept for backward compatibility with callers that need atomic JSON updates.
func (s *JSONStore) WithState(fn func(*State) (bool, error)) error {
	unlock, err := s.lock()
	if err != nil {
		return err
	}
	defer unlock()

	state, err := s.Load()
	if err != nil {
		return err
	}
	changed, err := fn(&state)
	if err != nil {
		if changed {
			if saveErr := s.Save(state); saveErr != nil {
				return saveErr
			}
		}
		return err
	}
	if changed {
		return s.Save(state)
	}
	return nil
}

func (s *JSONStore) lock() (func(), error) {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return nil, fmt.Errorf("create state dir: %w", err)
	}
	file, err := os.OpenFile(s.path+".lock", os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open state lock: %w", err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("lock state: %w", err)
	}
	return func() {
		_ = syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
		_ = file.Close()
	}, nil
}
