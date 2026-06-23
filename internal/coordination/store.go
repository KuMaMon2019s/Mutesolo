package coordination

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type Store struct {
	path string
}

func NewStore(path string) Store {
	return Store{path: path}
}

func DefaultStatePath() string {
	if path := os.Getenv("OPENCLAW_STATE"); path != "" {
		return path
	}
	return ".openclaw/state.json"
}

func (s Store) Load() (State, error) {
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

func (s Store) Save(state State) error {
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
