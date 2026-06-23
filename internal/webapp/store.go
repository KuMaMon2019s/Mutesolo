package webapp

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type State struct {
	Config   Config    `json:"config"`
	Projects []Project `json:"projects"`
}

type Store struct {
	path string
}

func NewStore(path string) Store {
	return Store{path: path}
}

func DefaultStatePath() string {
	if path := os.Getenv("MUTISOLO_WEB_STATE"); path != "" {
		return path
	}
	return ".openclaw/web-state.json"
}

func (s Store) Load() (State, error) {
	data, err := os.ReadFile(s.path)
	if err == nil {
		var state State
		if err := json.Unmarshal(data, &state); err != nil {
			return State{}, fmt.Errorf("decode web state: %w", err)
		}
		return state, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return State{}, fmt.Errorf("read web state: %w", err)
	}
	state := State{
		Config: Config{
			OpenClawBaseURL: "http://100.x.y.z:18800",
			ClawHubBaseURL:  "https://clawhub.example.com",
		},
		Projects: []Project{},
	}
	return state, s.Save(state)
}

func (s Store) Save(state State) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create web state dir: %w", err)
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode web state: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write web state: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("replace web state: %w", err)
	}
	return nil
}

func UpsertProject(state *State, input Project) Project {
	now := time.Now().UTC()
	input.Name = strings.TrimSpace(input.Name)
	if input.ID == "" {
		input.ID = newID(input.Name)
		input.CreatedAt = now
	}
	input.UpdatedAt = now
	if input.Requirements == nil {
		input.Requirements = []Requirement{}
	}
	for i, project := range state.Projects {
		if project.ID == input.ID {
			if input.CreatedAt.IsZero() {
				input.CreatedAt = project.CreatedAt
			}
			if input.Requirements == nil {
				input.Requirements = project.Requirements
			}
			state.Projects[i] = input
			return input
		}
	}
	state.Projects = append(state.Projects, input)
	sortProjects(state.Projects)
	return input
}

func AddRequirement(state *State, projectID string, input Requirement) (Requirement, bool) {
	now := time.Now().UTC()
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		input.Title = strings.TrimSpace(input.Title)
		if input.ID == "" {
			input.ID = newID(input.Title)
			input.CreatedAt = now
		}
		if input.Status == "" {
			input.Status = "draft"
		}
		input.UpdatedAt = now
		state.Projects[pi].Requirements = append(state.Projects[pi].Requirements, input)
		state.Projects[pi].UpdatedAt = now
		return input, true
	}
	return Requirement{}, false
}

func FindProject(state State, id string) (Project, bool) {
	for _, project := range state.Projects {
		if project.ID == id {
			return project, true
		}
	}
	return Project{}, false
}

func FindRequirement(project Project, id string) (Requirement, bool) {
	for _, req := range project.Requirements {
		if req.ID == id {
			return req, true
		}
	}
	return Requirement{}, false
}

func sortProjects(projects []Project) {
	sort.Slice(projects, func(i, j int) bool {
		return projects[i].UpdatedAt.After(projects[j].UpdatedAt)
	})
}

func newID(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	id := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= '0' && r <= '9':
			return r
		default:
			return '-'
		}
	}, name)
	id = strings.Trim(id, "-")
	id = strings.Join(strings.FieldsFunc(id, func(r rune) bool { return r == '-' }), "-")
	if id == "" {
		id = "item"
	}
	return fmt.Sprintf("%s-%d", id, time.Now().UTC().UnixNano())
}
