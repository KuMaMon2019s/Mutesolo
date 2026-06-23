package coordination

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

var (
	ErrAgentNotFound = errors.New("agent not found")
	ErrTaskNotFound  = errors.New("task not found")
	ErrNoMatch       = errors.New("no matching agent")
)

type MatchResult struct {
	Agent       Agent    `json:"agent"`
	MatchedCaps []string `json:"matched_caps"`
	Coverage    float64  `json:"coverage"`
}

func CreateTask(state *State, id string, requiredCaps []string) (Task, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		id = fmt.Sprintf("task-%d", time.Now().UnixNano())
	}
	requiredCaps = normalizeCaps(requiredCaps)
	if len(requiredCaps) == 0 {
		return Task{}, errors.New("task requires at least one capability")
	}
	if findTaskIndex(*state, id) >= 0 {
		return Task{}, fmt.Errorf("task %q already exists", id)
	}

	task := Task{
		ID:           id,
		RequiredCaps: requiredCaps,
		Status:       TaskStatusPending,
	}
	state.Tasks = append(state.Tasks, task)
	state.Events = append(state.Events, NewEvent("task.created", task.ID, map[string]any{
		"required_caps": task.RequiredCaps,
	}))
	return task, nil
}

func MatchTask(state *State, taskID string) (MatchResult, error) {
	taskIndex := findTaskIndex(*state, taskID)
	if taskIndex < 0 {
		return MatchResult{}, ErrTaskNotFound
	}
	task := state.Tasks[taskIndex]
	best, ok := bestAgentForTask(*state, task)
	if !ok {
		state.Events = append(state.Events, NewEvent("task.match_failed", task.ID, nil))
		return MatchResult{}, ErrNoMatch
	}

	state.Tasks[taskIndex].Status = TaskStatusMatched
	state.Events = append(state.Events, NewEvent("task.matched", task.ID, map[string]any{
		"agent_id":     best.Agent.ID,
		"coverage":     best.Coverage,
		"matched_caps": best.MatchedCaps,
	}))
	return best, nil
}

func AssignTask(state *State, taskID, agentID string) (Session, error) {
	taskIndex := findTaskIndex(*state, taskID)
	if taskIndex < 0 {
		return Session{}, ErrTaskNotFound
	}
	agentIndex := findAgentIndex(*state, agentID)
	if agentIndex < 0 {
		return Session{}, ErrAgentNotFound
	}

	task := state.Tasks[taskIndex]
	agent := state.Agents[agentIndex]
	if agent.Status != AgentStatusOnline {
		return Session{}, fmt.Errorf("agent %q is %s", agent.ID, agent.Status)
	}
	matched := coverage(task.RequiredCaps, agent.Skills)
	if len(matched) == 0 {
		return Session{}, ErrNoMatch
	}

	session := Session{
		ID:      fmt.Sprintf("session-%s-%s", task.ID, agent.ID),
		AgentID: agent.ID,
		TaskID:  task.ID,
		Status:  SessionStatusActive,
	}
	state.Tasks[taskIndex].Status = TaskStatusAssigned
	state.Sessions = upsertSession(state.Sessions, session)
	state.Events = append(state.Events, NewEvent("task.assigned", task.ID, map[string]any{
		"agent_id":   agent.ID,
		"session_id": session.ID,
	}))
	return session, nil
}

func bestAgentForTask(state State, task Task) (MatchResult, bool) {
	var results []MatchResult
	for _, agent := range state.Agents {
		if agent.Status != AgentStatusOnline {
			continue
		}
		matched := coverage(task.RequiredCaps, agent.Skills)
		if len(matched) == 0 {
			continue
		}
		results = append(results, MatchResult{
			Agent:       agent,
			MatchedCaps: matched,
			Coverage:    float64(len(matched)) / float64(len(uniqueCaps(task.RequiredCaps))),
		})
	}
	if len(results) == 0 {
		return MatchResult{}, false
	}
	sort.Slice(results, func(i, j int) bool {
		if results[i].Coverage == results[j].Coverage {
			return results[i].Agent.ID < results[j].Agent.ID
		}
		return results[i].Coverage > results[j].Coverage
	})
	return results[0], true
}

func coverage(requiredCaps, agentCaps []string) []string {
	required := capSet(requiredCaps)
	agent := capSet(agentCaps)
	matched := make([]string, 0, len(required))
	for cap := range required {
		if agent[cap] {
			matched = append(matched, cap)
		}
	}
	sort.Strings(matched)
	return matched
}

func normalizeCaps(caps []string) []string {
	return uniqueCaps(caps)
}

func uniqueCaps(caps []string) []string {
	set := capSet(caps)
	out := make([]string, 0, len(set))
	for cap := range set {
		out = append(out, cap)
	}
	sort.Strings(out)
	return out
}

func capSet(caps []string) map[string]bool {
	set := make(map[string]bool, len(caps))
	for _, cap := range caps {
		cap = strings.ToLower(strings.TrimSpace(cap))
		if cap != "" {
			set[cap] = true
		}
	}
	return set
}

func findTaskIndex(state State, id string) int {
	for i, task := range state.Tasks {
		if task.ID == id {
			return i
		}
	}
	return -1
}

func findAgentIndex(state State, id string) int {
	for i, agent := range state.Agents {
		if agent.ID == id {
			return i
		}
	}
	return -1
}

func upsertSession(sessions []Session, session Session) []Session {
	for i, existing := range sessions {
		if existing.ID == session.ID {
			sessions[i] = session
			return sessions
		}
	}
	return append(sessions, session)
}
