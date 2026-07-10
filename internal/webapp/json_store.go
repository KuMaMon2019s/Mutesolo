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

// JSONStore implements Repository by reading/writing a single JSON file.
// It preserves the original file-based behaviour and serves as the fallback
// backend when SQLite is not available.
type JSONStore struct {
	path string
}

func NewJSONStore(path string) *JSONStore {
	return &JSONStore{path: path}
}

// NewStore keeps the old constructor name for backward compatibility.
func NewStore(path string) *JSONStore {
	return NewJSONStore(path)
}

func DefaultStatePath() string {
	if path := os.Getenv("MUTESOLO_WEB_STATE"); path != "" {
		return path
	}
	return ".ai-agent/web-state.json"
}

func (s *JSONStore) Load() (State, error) {
	data, err := os.ReadFile(s.path)
	if err == nil {
		var state State
		if err := json.Unmarshal(data, &state); err != nil {
			return State{}, fmt.Errorf("decode web state: %w", err)
		}
		ensureStateDefaults(&state)
		return state, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return State{}, fmt.Errorf("read web state: %w", err)
	}
	state := State{
		Config: Config{
			AIAgentBaseURL: "http://100.x.y.z:18800",
			ClawHubBaseURL: "https://clawhub.example.com",
		},
		Projects: []Project{},
	}
	return state, s.Save(state)
}

func (s *JSONStore) Save(state State) error {
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
	// Rebuild stats after every save.
	if err := s.RebuildStats(state); err != nil {
		return fmt.Errorf("rebuild stats: %w", err)
	}
	return nil
}

// SaveMembers persists only the member list by loading the full state, updating
// the Members field, and saving back.
func (s *JSONStore) SaveMembers(members []Member) error {
	state, err := s.Load()
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for i := range members {
		if members[i].UpdatedAt == "" {
			members[i].UpdatedAt = now
		}
	}
	state.Members = members
	return s.Save(state)
}

// LoadMembers reads the member list from the persisted state.
func (s *JSONStore) LoadMembers() ([]Member, error) {
	state, err := s.Load()
	if err != nil {
		return nil, err
	}
	if state.Members == nil {
		return []Member{}, nil
	}
	return state.Members, nil
}

// ---------------------------------------------------------------------------
// Pure helpers – operate on State, no I/O
// ---------------------------------------------------------------------------

func UpsertProject(state *State, input Project) Project {
	now := time.Now().UTC()
	input.Name = strings.TrimSpace(input.Name)
	if input.ID == "" {
		input.ID = newID(input.Name)
		input.CreatedAt = now
	}
	input.UpdatedAt = now
	if len(input.Branches) == 0 {
		input.Branches = []ProjectBranch{{ID: "main", Name: "Main", CreatedAt: now}}
	}
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
			if len(input.Branches) == 0 {
				input.Branches = project.Branches
			}
			state.Projects[i] = input
			ensureProjectDefaults(&state.Projects[i])
			return state.Projects[i]
		}
	}
	state.Projects = append(state.Projects, input)
	ensureProjectDefaults(&state.Projects[len(state.Projects)-1])
	sortProjects(state.Projects)
	for _, project := range state.Projects {
		if project.ID == input.ID {
			return project
		}
	}
	return input
}

func AddRequirement(state *State, projectID string, input Requirement) (Requirement, bool) {
	now := time.Now().UTC()
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		ensureProjectDefaults(&state.Projects[pi])
		input.Title = strings.TrimSpace(input.Title)
		if input.ID == "" {
			input.ID = newID(input.Title)
			input.CreatedAt = now
		}
		if input.BranchID == "" {
			input.BranchID = state.Projects[pi].Branches[0].ID
		}
		if input.Priority == "" {
			input.Priority = "low"
		}
		if input.AgentID == "" {
			input.AgentID = "ai-agent-a"
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

func UpdateRequirementDetails(state *State, projectID string, reqID string, input Requirement) (Requirement, bool) {
	now := time.Now().UTC()
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		ensureProjectDefaults(&state.Projects[pi])
		for ri := range state.Projects[pi].Requirements {
			req := &state.Projects[pi].Requirements[ri]
			if req.ID != reqID {
				continue
			}
			if strings.TrimSpace(input.Title) != "" {
				req.Title = strings.TrimSpace(input.Title)
			}
			req.Description = strings.TrimSpace(input.Description)
			if strings.TrimSpace(input.Priority) != "" {
				req.Priority = strings.TrimSpace(input.Priority)
			}
			if strings.TrimSpace(input.AgentID) != "" {
				req.AgentID = strings.TrimSpace(input.AgentID)
			}
			if strings.TrimSpace(input.AssignedMember) != "" {
				req.AssignedMember = strings.TrimSpace(input.AssignedMember)
			}
			if len(input.EditorContent) > 0 {
				req.EditorContent = input.EditorContent
			}
			if len(input.Attachments) > 0 {
				req.Attachments = input.Attachments
			}
			req.UpdatedAt = now
			state.Projects[pi].UpdatedAt = now
			return *req, true
		}
		return Requirement{}, false
	}
	return Requirement{}, false
}

func AddBranch(state *State, projectID string, name string) (ProjectBranch, bool) {
	now := time.Now().UTC()
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Branch"
	}
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		ensureProjectDefaults(&state.Projects[pi])
		branch := ProjectBranch{ID: newID(name), Name: name, CreatedAt: now}
		state.Projects[pi].Branches = append(state.Projects[pi].Branches, branch)
		state.Projects[pi].UpdatedAt = now
		return branch, true
	}
	return ProjectBranch{}, false
}

func UpdateRequirements(state *State, projectID string, update BoardUpdate) ([]Requirement, bool) {
	now := time.Now().UTC()
	ids := make(map[string]bool, len(update.RequirementIDs))
	for _, id := range update.RequirementIDs {
		ids[id] = true
	}
	status := strings.TrimSpace(update.Status)
	updated := make([]Requirement, 0, len(ids))
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		ensureProjectDefaults(&state.Projects[pi])
		for ri := range state.Projects[pi].Requirements {
			req := &state.Projects[pi].Requirements[ri]
			if ids[req.ID] {
				if status != "" {
					req.Status = status
				}
				if strings.TrimSpace(update.BranchID) != "" {
					req.BranchID = strings.TrimSpace(update.BranchID)
				}
				if strings.TrimSpace(update.AgentID) != "" {
					req.AgentID = strings.TrimSpace(update.AgentID)
				}
				if strings.TrimSpace(update.CommitID) != "" {
					req.CommitID = strings.TrimSpace(update.CommitID)
				}
				req.UpdatedAt = now
				updated = append(updated, *req)
			}
		}
		state.Projects[pi].UpdatedAt = now
		return updated, true
	}
	return nil, false
}

func ensureStateDefaults(state *State) {
	for i := range state.Projects {
		ensureProjectDefaults(&state.Projects[i])
	}
}

func ensureProjectDefaults(project *Project) {
	if len(project.Branches) == 0 {
		created := project.CreatedAt
		if created.IsZero() {
			created = time.Now().UTC()
		}
		project.Branches = []ProjectBranch{{ID: "main", Name: "Main", CreatedAt: created}}
	}
	for i := range project.Requirements {
		if project.Requirements[i].BranchID == "" {
			project.Requirements[i].BranchID = project.Branches[0].ID
		}
		if project.Requirements[i].Priority == "" {
			project.Requirements[i].Priority = "low"
		}
		if project.Requirements[i].AgentID == "" {
			project.Requirements[i].AgentID = "ai-agent-a"
		}
	}
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
			return -1
		}
	}, name)
	if id == "" {
		id = "item"
	}
	return fmt.Sprintf("%s%d", id, time.Now().UTC().UnixNano())
}

// statsPath returns the path to the stats JSON file alongside the main state file.
func (s *JSONStore) statsPath() string {
	return s.path + ".stats.json"
}

// RebuildStats computes stats from the state and persists them to a dedicated JSON file.
func (s *JSONStore) RebuildStats(state State) error {
	entries := computeStatsEntries(state)
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return fmt.Errorf("encode stats: %w", err)
	}
	if err := os.WriteFile(s.statsPath(), append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write stats: %w", err)
	}
	return nil
}

// LoadStats reads pre-built stats from the dedicated JSON file.
func (s *JSONStore) LoadStats(projectID, branchID string) (StatsResponse, error) {
	entries, err := s.loadStatsEntries()
	if err != nil {
		return StatsResponse{}, err
	}
	return aggregateStats(entries, projectID, branchID), nil
}

func (s *JSONStore) loadStatsEntries() ([]StatsEntry, error) {
	data, err := os.ReadFile(s.statsPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read stats: %w", err)
	}
	var entries []StatsEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("decode stats: %w", err)
	}
	return entries, nil
}

// computeStatsEntries builds []StatsEntry from the current State.
func computeStatsEntries(state State) []StatsEntry {
	var entries []StatsEntry
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
			entries = append(entries, StatsEntry{
				ProjectID: project.ID,
				BranchID:  branchID,
				Member:    member,
				Status:    status,
				Count:     1,
			})
		}
	}
	return entries
}

// aggregateStats groups StatsEntry rows by member and status, with optional filters.
func aggregateStats(entries []StatsEntry, projectID, branchID string) StatsResponse {
	memberMap := make(map[string]map[string]int)
	for _, e := range entries {
		if projectID != "" && e.ProjectID != projectID {
			continue
		}
		if branchID != "" && e.BranchID != branchID {
			continue
		}
		if _, ok := memberMap[e.Member]; !ok {
			memberMap[e.Member] = make(map[string]int)
		}
		memberMap[e.Member][e.Status] += e.Count
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
	return stats
}
