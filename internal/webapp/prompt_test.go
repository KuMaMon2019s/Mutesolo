package webapp

import (
	"strings"
	"testing"
)

func TestBuildPromptSegmentsAndStoresArtifact(t *testing.T) {
	project := Project{
		ID:          "project-1",
		Name:        "Console",
		Description: "OpenClaw control console",
		Plan:        "Connect status, manage requirements, emit prompts",
		Docs:        "Keep generated output separated from runtime",
	}
	req := Requirement{
		ID:          "req-1",
		Title:       "Status panel",
		Description: "Show online and offline state",
	}

	result, err := StorePromptArtifact(project, req, BuildPrompt(project, req), t.TempDir())
	if err != nil {
		t.Fatalf("StorePromptArtifact returned error: %v", err)
	}
	if result.ProjectID != project.ID {
		t.Fatalf("project id = %q, want %q", result.ProjectID, project.ID)
	}
	if len(result.Segments) == 0 {
		t.Fatal("prompt was not segmented")
	}
	if result.ArtifactPath == "" {
		t.Fatal("artifact path is empty")
	}
	if result.DiscordText == "" {
		t.Fatal("discord text is empty")
	}
}

func TestBuildDiscordMessageIncludesCommitInstruction(t *testing.T) {
	project := Project{Name: "Console"}
	req := Requirement{ID: "req-1", Title: "Status panel"}

	message := BuildDiscordMessage(project, req, "do the work")

	if !strings.Contains(message, "OpenClaw A task") {
		t.Fatalf("message does not target OpenClaw A: %q", message)
	}
	if !strings.Contains(message, "commit: <sha>") {
		t.Fatalf("message does not include commit instruction: %q", message)
	}
}
