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
	return strings.TrimSpace(fmt.Sprintf("%s task\n\n%sProject: %s\nRequirement: %s\nRequirement ID: %s\n\nAfter completing the work, commit to GitHub and reply with:\ncommit: <sha>\n\nPrompt:\n%s", agentDisplayName(req.AgentID), mention, project.Name, req.Title, req.ID, prompt))
}

func BuildRequirementEditorPrompt(plainText string, blocks []map[string]any, docs []RequirementEditorTencentDoc, attachments []RequirementEditorAttachment) string {
	plainText = strings.TrimSpace(plainText)
	if plainText == "" {
		plainText = "No plain text was extracted yet. Inspect the provided blocks JSON before generating final output."
	}
	var builder strings.Builder
	builder.WriteString("Generate a concise implementation prompt for OpenClaw from this requirement context.\n\n")
	builder.WriteString("Rules:\n")
	builder.WriteString("- Use only the structured context prepared by the local backend.\n")
	builder.WriteString("- Do not request or read localhost paths, local filesystem paths, or browser blob URLs.\n")
	builder.WriteString("- Treat attachments as local artifacts that must be parsed by the local backend before online LLM use.\n\n")
	builder.WriteString("Requirement text:\n")
	builder.WriteString(plainText)
	builder.WriteString("\n\nTencent docs:\n")
	if len(docs) == 0 {
		builder.WriteString("- none\n")
	} else {
		for _, doc := range docs {
			builder.WriteString(fmt.Sprintf("- %s: %s\n  Read instruction: %s\n", fallback(doc.Title, "Untitled Tencent Doc"), doc.URL, fallback(doc.ReadInstruction, "No special instruction")))
		}
	}
	builder.WriteString("\nLocal attachments:\n")
	if len(attachments) == 0 {
		builder.WriteString("- none\n")
	} else {
		for _, attachment := range attachments {
			builder.WriteString(fmt.Sprintf("- %s (%s, %s, %d bytes)\n", attachment.Name, attachment.Kind, attachment.MIMEType, attachment.Size))
		}
	}
	builder.WriteString(fmt.Sprintf("\nBlock count: %d\n", len(blocks)))
	return strings.TrimSpace(builder.String())
}

func agentDisplayName(agentID string) string {
	agentID = strings.TrimSpace(agentID)
	switch agentID {
	case "", "openclaw-a":
		return "OpenClaw A"
	case "openclaw-b":
		return "OpenClaw B"
	case "openclaw-c":
		return "OpenClaw C"
	default:
		return agentID
	}
}

func fallback(value string, replacement string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return replacement
	}
	return value
}
