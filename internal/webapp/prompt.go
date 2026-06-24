package webapp

import (
	"fmt"
	"strings"

	controllayer "openclaw-coordination/control_layer"
)

func BuildPrompt(project Project, req Requirement) string {
	parts := []string{
		"You are OpenClaw executing one bounded requirement.",
		"Stay inside the requested module boundary unless a human explicitly approves broader work.",
		"Return implementation notes and artifact-ready output only.",
		"",
		"Project:",
		project.Name,
		project.Description,
		"",
		"Planning map:",
		project.Plan,
		"",
		"Requirement document:",
		project.Docs,
		"",
		"Requirement point:",
		req.Title,
		req.Description,
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func SegmentPrompt(prompt string) []string {
	lines := strings.Split(prompt, "\n")
	segments := make([]string, 0, 4)
	var current []string
	for _, line := range lines {
		current = append(current, line)
		if len(current) >= 6 {
			segments = append(segments, strings.TrimSpace(strings.Join(current, "\n")))
			current = nil
		}
	}
	if len(current) > 0 {
		segments = append(segments, strings.TrimSpace(strings.Join(current, "\n")))
	}
	return segments
}

func StorePromptArtifact(project Project, req Requirement, prompt string, artifactDir string) (PromptResult, error) {
	result, err := controllayer.RunPipeline(controllayer.PipelineInput{
		Prompt: prompt,
	}, artifactDir)
	if err != nil {
		return PromptResult{}, err
	}
	if result.Artifact.Validation.Status == controllayer.ValidationBlocked {
		return PromptResult{}, fmt.Errorf("prompt artifact blocked: %s", strings.Join(result.Artifact.Validation.Reasons, "; "))
	}
	return PromptResult{
		ProjectID:     project.ID,
		RequirementID: req.ID,
		Segments:      SegmentPrompt(prompt),
		ArtifactPath:  result.Path,
		DiscordText:   BuildDiscordMessage(project, req, prompt),
	}, nil
}

func BuildDiscordMessage(project Project, req Requirement, prompt string) string {
	return BuildDiscordMessageForBot(project, req, prompt, "")
}

func BuildDiscordMessageForBot(project Project, req Requirement, prompt string, botID string) string {
	mention := ""
	botID = strings.TrimSpace(botID)
	if botID != "" {
		mention = fmt.Sprintf("<@%s>\n\n", botID)
	}
	return strings.TrimSpace(fmt.Sprintf(`%s task

%sProject: %s
Requirement: %s
Requirement ID: %s

After completing the work, commit to GitHub and reply with:
commit: <sha>

Prompt:
%s`, agentDisplayName(req.AgentID), mention, project.Name, req.Title, req.ID, prompt))
}

func agentDisplayName(agentID string) string {
	switch strings.TrimSpace(agentID) {
	case "openclaw-b":
		return "OpenClaw B"
	case "openclaw-c":
		return "OpenClaw C"
	default:
		return "OpenClaw A"
	}
}
