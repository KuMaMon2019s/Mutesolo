package webapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Connector struct {
	client *http.Client
}

func NewConnector() Connector {
	return Connector{client: &http.Client{Timeout: 5 * time.Second}}
}

type discordWidgetResponse struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	PresenceCount int    `json:"presence_count"`
	Members       []struct {
		ID        string `json:"id"`
		Username  string `json:"username"`
		Status    string `json:"status"`
		AvatarURL string `json:"avatar_url"`
	} `json:"members"`
}

func (c Connector) CheckAIAgent(ctx context.Context, guildID, botUsername string) AIAgentStatus {
	status := AIAgentStatus{
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Members:   []DiscordMember{},
	}
	guildID = strings.TrimSpace(guildID)
	if guildID == "" {
		status.Error = "configure a Discord Guild ID"
		return status
	}

	widgetURL := fmt.Sprintf("https://discord.com/api/guilds/%s/widget.json", guildID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, widgetURL, nil)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	resp, err := c.client.Do(req)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		status.Error = fmt.Sprintf("discord widget returned HTTP %d", resp.StatusCode)
		return status
	}

	var widget discordWidgetResponse
	if err := json.NewDecoder(resp.Body).Decode(&widget); err != nil {
		status.Error = err.Error()
		return status
	}

	status.PresenceCount = widget.PresenceCount
	for _, member := range widget.Members {
		status.Members = append(status.Members, DiscordMember{
			ID:        member.ID,
			Username:  member.Username,
			Status:    member.Status,
			AvatarURL: member.AvatarURL,
		})
	}

	botUsername = strings.TrimSpace(botUsername)
	if botUsername == "" {
		status.Error = "configure a Discord Bot Username to check online status"
		return status
	}

	for _, member := range widget.Members {
		if strings.EqualFold(member.Username, botUsername) {
			status.Online = true
			status.Name = member.Username
			status.AvatarURL = member.AvatarURL
			return status
		}
	}

	status.Name = botUsername
	return status
}

func (c Connector) GetDiscordMembers(ctx context.Context, guildID string) ([]DiscordMember, error) {
	guildID = strings.TrimSpace(guildID)
	if guildID == "" {
		return nil, fmt.Errorf("configure a Discord Guild ID")
	}
	widgetURL := fmt.Sprintf("https://discord.com/api/guilds/%s/widget.json", guildID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, widgetURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("discord widget returned HTTP %d", resp.StatusCode)
	}
	var widget discordWidgetResponse
	if err := json.NewDecoder(resp.Body).Decode(&widget); err != nil {
		return nil, err
	}
	var members []DiscordMember
	for _, member := range widget.Members {
		members = append(members, DiscordMember{
			ID:        member.ID,
			Username:  member.Username,
			Status:    member.Status,
			AvatarURL: member.AvatarURL,
		})
	}
	return members, nil
}

func (c Connector) ListClawHubSkills(ctx context.Context, baseURL string) ([]SkillSummary, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" || strings.Contains(baseURL, "example.com") {
		return []SkillSummary{}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/skills", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("clawhub returned HTTP %d", resp.StatusCode)
	}
	var skills []SkillSummary
	if err := json.NewDecoder(resp.Body).Decode(&skills); err != nil {
		return nil, err
	}
	return skills, nil
}

func (c Connector) GetClawHubSkill(ctx context.Context, baseURL, skillID string) (SkillSummary, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.TrimSpace(skillID) == "" {
		return SkillSummary{}, fmt.Errorf("skill id is required")
	}
	if baseURL == "" || strings.Contains(baseURL, "example.com") {
		return SkillSummary{ID: skillID, Description: "Configure a private ClawHub URL to load skill details."}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/skills/"+skillID, nil)
	if err != nil {
		return SkillSummary{}, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return SkillSummary{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SkillSummary{}, fmt.Errorf("clawhub skill returned HTTP %d", resp.StatusCode)
	}
	var skill SkillSummary
	if err := json.NewDecoder(resp.Body).Decode(&skill); err != nil {
		return SkillSummary{}, err
	}
	if skill.ID == "" {
		skill.ID = skillID
	}
	return skill, nil
}

func (c Connector) InstallSkillOnAIAgent(ctx context.Context, aiAgentURL, token, clawHubURL string, req SkillInstallRequest) (SkillInstallResult, error) {
	if strings.TrimSpace(req.SkillID) == "" {
		return SkillInstallResult{}, fmt.Errorf("skill id is required")
	}
	prompt := fmt.Sprintf(`Install private ClawHub skill for this AI agent.

Skill ID: %s
ClawHub URL: %s
Target agent: %s

Use the local skill installer if available. Do not modify system architecture. Report installation result only.`, req.SkillID, strings.TrimSpace(clawHubURL), strings.TrimSpace(req.AgentID))
	result, err := c.SendAIAgentPrompt(ctx, aiAgentURL, token, prompt)
	return SkillInstallResult{SkillID: req.SkillID, Result: result}, err
}

func (c Connector) SendAIAgentPrompt(ctx context.Context, baseURL, token, prompt string) (SendResult, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	result := SendResult{Endpoint: baseURL + "/message"}
	if baseURL == "" || strings.Contains(baseURL, "100.x.y.z") {
		return result, fmt.Errorf("configure an AI Agent Tailscale URL")
	}
	if strings.TrimSpace(prompt) == "" {
		return result, fmt.Errorf("prompt is required")
	}

	body, err := json.Marshal(map[string]any{
		"message": prompt,
		"metadata": map[string]string{
			"source": "Mutesolo-coordination-layer",
		},
	})
	if err != nil {
		return result, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, result.Endpoint, bytes.NewReader(body))
	if err != nil {
		return result, err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	result.StatusCode = resp.StatusCode
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	result.Message = strings.TrimSpace(string(responseBody))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return result, fmt.Errorf("ai agent returned HTTP %d", resp.StatusCode)
	}
	result.Sent = true
	return result, nil
}

func stringField(values map[string]any, key string) string {
	value, _ := values[key].(string)
	return value
}

func firstString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := stringField(values, key); value != "" {
			return value
		}
	}
	return ""
}
