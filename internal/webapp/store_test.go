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

func TestProjectDefaultsCreateMainBranch(t *testing.T) {
	state := State{}

	project := UpsertProject(&state, Project{Name: "Console"})

	if len(project.Branches) != 1 {
		t.Fatalf("branches = %d, want 1", len(project.Branches))
	}
	if project.Branches[0].ID != "main" {
		t.Fatalf("branch id = %q, want main", project.Branches[0].ID)
	}
}

func TestRequirementCanMoveToBranch(t *testing.T) {
	state := State{}
	project := UpsertProject(&state, Project{Name: "Console"})
	branch, ok := AddBranch(&state, project.ID, "Experiment")
	if !ok {
		t.Fatal("AddBranch did not find project")
	}
	req, ok := AddRequirement(&state, project.ID, Requirement{Title: "Move me"})
	if !ok {
		t.Fatal("AddRequirement did not find project")
	}

	_, ok = UpdateRequirements(&state, project.ID, BoardUpdate{
		RequirementIDs: []string{req.ID},
		BranchID:       branch.ID,
		Status:         "draft",
	})
	if !ok {
		t.Fatal("UpdateRequirements did not find project")
	}

	updated, ok := FindProject(state, project.ID)
	if !ok {
		t.Fatal("FindProject did not find project")
	}
	if updated.Requirements[0].BranchID != branch.ID {
		t.Fatalf("branch id = %q, want %q", updated.Requirements[0].BranchID, branch.ID)
	}
}
