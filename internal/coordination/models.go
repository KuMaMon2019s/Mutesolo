package coordination

import "time"

type AgentStatus string

const (
	AgentStatusOnline  AgentStatus = "online"
	AgentStatusOffline AgentStatus = "offline"
	AgentStatusBusy    AgentStatus = "busy"
)

type TaskStatus string

const (
	TaskStatusPending  TaskStatus = "pending"
	TaskStatusMatched  TaskStatus = "matched"
	TaskStatusAssigned TaskStatus = "assigned"
)

type SessionStatus string

const (
	SessionStatusActive SessionStatus = "active"
	SessionStatusClosed SessionStatus = "closed"
)

type Agent struct {
	ID      string      `json:"id"`
	Address string      `json:"address"`
	Status  AgentStatus `json:"status"`
	Skills  []string    `json:"skills"`
}

type Skill struct {
	ID           string   `json:"id"`
	Capabilities []string `json:"capabilities"`
	Version      string   `json:"version"`
}

type Task struct {
	ID           string     `json:"id"`
	RequiredCaps []string   `json:"required_caps"`
	Status       TaskStatus `json:"status"`
}

type Session struct {
	ID      string        `json:"id"`
	AgentID string        `json:"agent_id"`
	TaskID  string        `json:"task_id"`
	Status  SessionStatus `json:"status"`
}

type Event struct {
	Type      string         `json:"type"`
	EntityID  string         `json:"entity_id"`
	Payload   map[string]any `json:"payload,omitempty"`
	Timestamp time.Time      `json:"timestamp"`
}

type State struct {
	Agents   []Agent   `json:"agents"`
	Skills   []Skill   `json:"skills"`
	Tasks    []Task    `json:"tasks"`
	Sessions []Session `json:"sessions"`
	Events   []Event   `json:"events"`
}

func InitialState() State {
	return State{
		Agents: []Agent{
			{ID: "agent-a", Address: "a2a://agent-a", Status: AgentStatusOnline, Skills: []string{"planning", "code", "test"}},
			{ID: "agent-b", Address: "a2a://agent-b", Status: AgentStatusOnline, Skills: []string{"research", "summarize", "docs"}},
			{ID: "agent-c", Address: "a2a://agent-c", Status: AgentStatusOnline, Skills: []string{"ops", "deploy", "monitor"}},
		},
		Skills: []Skill{
			{ID: "skill-planning", Capabilities: []string{"planning"}, Version: "0.1.0"},
			{ID: "skill-code", Capabilities: []string{"code", "test"}, Version: "0.1.0"},
			{ID: "skill-research", Capabilities: []string{"research", "summarize"}, Version: "0.1.0"},
			{ID: "skill-docs", Capabilities: []string{"docs"}, Version: "0.1.0"},
			{ID: "skill-ops", Capabilities: []string{"ops", "deploy", "monitor"}, Version: "0.1.0"},
		},
		Tasks:    []Task{},
		Sessions: []Session{},
		Events: []Event{
			NewEvent("state.initialized", "coordination", map[string]any{"source": "mock"}),
		},
	}
}

func NewEvent(eventType, entityID string, payload map[string]any) Event {
	return Event{
		Type:      eventType,
		EntityID:  entityID,
		Payload:   payload,
		Timestamp: time.Now().UTC(),
	}
}
