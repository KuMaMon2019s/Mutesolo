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

func TestBuildDiscordMessageCanMentionBot(t *testing.T) {
	project := Project{Name: "Console"}
	req := Requirement{ID: "req-1", Title: "Status panel"}

	message := BuildDiscordMessageForBot(project, req, "do the work", "1503733248587730996")

	if !strings.Contains(message, "<@1503733248587730996>") {
		t.Fatalf("message does not mention bot: %q", message)
	}
}

func TestBuildDiscordMessageTargetsAssignedAgent(t *testing.T) {
	project := Project{Name: "Console"}
	req := Requirement{ID: "req-1", Title: "Status panel", AgentID: "openclaw-b"}

	message := BuildDiscordMessage(project, req, "do the work")

	if !strings.Contains(message, "OpenClaw B task") {
		t.Fatalf("message does not target assigned agent: %q", message)
	}
}

func TestBuildDiscordMessageTargetsTailscaleAgentName(t *testing.T) {
	project := Project{Name: "Console"}
	req := Requirement{ID: "req-1", Title: "Status panel", AgentID: "panda"}

	message := BuildDiscordMessage(project, req, "do the work")

	if !strings.Contains(message, "panda task") {
		t.Fatalf("message does not target tailscale agent name: %q", message)
	}
}

func TestBuildRequirementEditorPromptKeepsLocalFilesBehindBackend(t *testing.T) {
	prompt := BuildRequirementEditorPrompt(
		"实现登录页",
		[]map[string]any{{"type": "paragraph"}},
		[]RequirementEditorTencentDoc{{
			Type:            "tencent_doc",
			Title:           "需求说明文档",
			URL:             "https://docs.qq.com/example",
			ReadInstruction: "只读取功能需求和接口要求",
		}},
		[]RequirementEditorAttachment{{
			Name:     "flow.png",
			MIMEType: "image/png",
			Size:     2048,
			Kind:     "image",
			Source:   "local_browser_attachment",
		}},
	)

	for _, want := range []string{
		"Do not request or read localhost paths",
		"https://docs.qq.com/example",
		"只读取功能需求和接口要求",
		"flow.png",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt does not contain %q: %q", want, prompt)
		}
	}
}
