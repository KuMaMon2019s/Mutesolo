package coordination

import "testing"

func TestCreateTaskNormalizesCaps(t *testing.T) {
	state := InitialState()

	task, err := CreateTask(&state, "task-1", []string{" Code ", "test", "code"})
	if err != nil {
		t.Fatalf("CreateTask returned error: %v", err)
	}

	if task.ID != "task-1" {
		t.Fatalf("task id = %q, want task-1", task.ID)
	}
	if got := joinCaps(task.RequiredCaps); got != "code,test" {
		t.Fatalf("required caps = %q, want code,test", got)
	}
	if task.Status != TaskStatusPending {
		t.Fatalf("task status = %q, want pending", task.Status)
	}
	if len(state.Events) == 0 || state.Events[len(state.Events)-1].Type != "task.created" {
		t.Fatalf("last event type = %q, want task.created", state.Events[len(state.Events)-1].Type)
	}
}

func TestCreateTaskRejectsEmptyCapsAfterNormalization(t *testing.T) {
	state := InitialState()

	_, err := CreateTask(&state, "task-1", []string{" ", ""})
	if err == nil {
		t.Fatal("CreateTask returned nil error, want validation error")
	}
}

func TestMatchTaskChoosesHighestCoverageOnlineAgent(t *testing.T) {
	state := State{
		Agents: []Agent{
			{ID: "agent-a", Status: AgentStatusOnline, Skills: []string{"code"}},
			{ID: "agent-b", Status: AgentStatusOnline, Skills: []string{"code", "test"}},
			{ID: "agent-c", Status: AgentStatusOffline, Skills: []string{"code", "test", "deploy"}},
		},
		Tasks: []Task{
			{ID: "task-1", RequiredCaps: []string{"code", "test"}, Status: TaskStatusPending},
		},
	}

	result, err := MatchTask(&state, "task-1")
	if err != nil {
		t.Fatalf("MatchTask returned error: %v", err)
	}

	if result.Agent.ID != "agent-b" {
		t.Fatalf("matched agent = %q, want agent-b", result.Agent.ID)
	}
	if result.Coverage != 1 {
		t.Fatalf("coverage = %v, want 1", result.Coverage)
	}
	if state.Tasks[0].Status != TaskStatusMatched {
		t.Fatalf("task status = %q, want matched", state.Tasks[0].Status)
	}
}

func TestAssignTaskCreatesSessionAndEvent(t *testing.T) {
	state := State{
		Agents: []Agent{
			{ID: "agent-a", Status: AgentStatusOnline, Skills: []string{"code"}},
		},
		Tasks: []Task{
			{ID: "task-1", RequiredCaps: []string{"code"}, Status: TaskStatusPending},
		},
	}

	session, err := AssignTask(&state, "task-1", "agent-a")
	if err != nil {
		t.Fatalf("AssignTask returned error: %v", err)
	}

	if session.ID != "session-task-1-agent-a" {
		t.Fatalf("session id = %q, want session-task-1-agent-a", session.ID)
	}
	if state.Tasks[0].Status != TaskStatusAssigned {
		t.Fatalf("task status = %q, want assigned", state.Tasks[0].Status)
	}
	if len(state.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(state.Sessions))
	}
	if len(state.Events) != 1 || state.Events[0].Type != "task.assigned" {
		t.Fatalf("event type = %q, want task.assigned", state.Events[0].Type)
	}
}

func joinCaps(caps []string) string {
	if len(caps) == 0 {
		return ""
	}
	out := caps[0]
	for _, cap := range caps[1:] {
		out += "," + cap
	}
	return out
}
