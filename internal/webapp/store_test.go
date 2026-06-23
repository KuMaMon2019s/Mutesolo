package webapp

import "testing"

func TestUpdateRequirementsClosesSelectedWithCommit(t *testing.T) {
	state := State{
		Projects: []Project{
			{
				ID: "project-1",
				Requirements: []Requirement{
					{ID: "req-1", Status: "sent"},
					{ID: "req-2", Status: "sent"},
					{ID: "req-3", Status: "draft"},
				},
			},
		},
	}

	updated, ok := UpdateRequirements(&state, "project-1", BoardUpdate{
		RequirementIDs: []string{"req-1", "req-2"},
		CommitID:       "abc1234",
		Status:         "closed",
	})
	if !ok {
		t.Fatal("project was not found")
	}
	if len(updated) != 2 {
		t.Fatalf("updated = %d, want 2", len(updated))
	}
	if state.Projects[0].Requirements[0].Status != "closed" {
		t.Fatalf("req-1 status = %q, want closed", state.Projects[0].Requirements[0].Status)
	}
	if state.Projects[0].Requirements[1].CommitID != "abc1234" {
		t.Fatalf("req-2 commit = %q, want abc1234", state.Projects[0].Requirements[1].CommitID)
	}
	if state.Projects[0].Requirements[2].Status != "draft" {
		t.Fatalf("req-3 status = %q, want draft", state.Projects[0].Requirements[2].Status)
	}
}
