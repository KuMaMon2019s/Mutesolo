package webapp

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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

// DiscordGuildMember represents a member returned by the Discord REST API.
type DiscordGuildMember struct {
	User struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	} `json:"user"`
	Nick string `json:"nick"`
}

// FetchGuildMembers uses a Bot Token to call the Discord REST API
// and return the list of guild members with real Discord user IDs.
func (c Connector) FetchGuildMembers(ctx context.Context, botToken, guildID string) ([]DiscordMember, error) {
	guildID = strings.TrimSpace(guildID)
	if guildID == "" {
		return nil, fmt.Errorf("configure a Discord Guild ID")
	}
	botToken = strings.TrimSpace(botToken)
	if botToken == "" {
		return nil, fmt.Errorf("configure a Discord Bot Token")
	}
	url := fmt.Sprintf("https://discord.com/api/v10/guilds/%s/members?limit=100", guildID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bot "+botToken)
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("discord api returned HTTP %d", resp.StatusCode)
	}

	var apiMembers []DiscordGuildMember
	if err := json.NewDecoder(resp.Body).Decode(&apiMembers); err != nil {
		return nil, err
	}
	members := make([]DiscordMember, 0, len(apiMembers))
	for _, m := range apiMembers {
		username := m.User.Username
		if m.Nick != "" {
			username = m.Nick
		}
		members = append(members, DiscordMember{
			ID:       m.User.ID,
			Username: username,
		})
	}
	return members, nil
}

func (c Connector) ListClawHubSkills(ctx context.Context, baseURL, apiKey string) ([]SkillSummary, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" || strings.Contains(baseURL, "example.com") {
		return []SkillSummary{}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/skills", nil)
	if err != nil {
		return nil, err
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("clawhub returned HTTP %d", resp.StatusCode)
	}
	var wrapper struct {
		Items []struct {
			Slug        string            `json:"slug"`
			DisplayName string            `json:"displayName"`
			Summary     string            `json:"summary"`
			Tags        map[string]string `json:"tags"`
			Stats       *SkillStats       `json:"stats"`
			CreatedAt   int64             `json:"createdAt"`
			UpdatedAt   int64             `json:"updatedAt"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&wrapper); err != nil {
		return nil, err
	}
	skills := make([]SkillSummary, 0, len(wrapper.Items))
	for _, item := range wrapper.Items {
		version := ""
		if item.Tags != nil {
			if v, ok := item.Tags["latest"]; ok {
				version = v
			}
		}
		skills = append(skills, SkillSummary{
			ID:          item.Slug,
			Name:        item.DisplayName,
			Description: item.Summary,
			Version:     version,
			Tags:        item.Tags,
			Stats:       item.Stats,
			CreatedAt:   item.CreatedAt,
			UpdatedAt:   item.UpdatedAt,
		})
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/skills/"+skillID, nil)
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
	var response struct {
		Skill struct {
			ID          string            `json:"id"`
			Name        string            `json:"name"`
			Description string            `json:"description"`
			Tags        map[string]string `json:"tags"`
			Version     string            `json:"version"`
		} `json:"skill"`
		LatestVersion struct {
			Version     string `json:"version"`
			Changelog   string `json:"changelog"`
			PublishedAt string `json:"published_at"`
		} `json:"latestVersion"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return SkillSummary{}, err
	}
	skill := SkillSummary{
		ID:          response.Skill.ID,
		Name:        response.Skill.Name,
		Description: response.Skill.Description,
		Tags:        response.Skill.Tags,
		Version:     response.Skill.Version,
	}
	if skill.ID == "" {
		skill.ID = skillID
	}
	return skill, nil
}

type ClawHubSkillFile struct {
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
}

func (c Connector) GetClawHubSkillFiles(ctx context.Context, baseURL, skillID string) ([]ClawHubSkillFile, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.TrimSpace(skillID) == "" {
		return nil, fmt.Errorf("skill id is required")
	}
	if baseURL == "" || strings.Contains(baseURL, "example.com") {
		return []ClawHubSkillFile{}, nil
	}

	rawURL := baseURL + "/api/v1/packages/" + skillID + "/download"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("clawhub skill download returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
	if err != nil {
		return nil, err
	}

	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return nil, err
	}
	files := make([]ClawHubSkillFile, 0, len(zr.File))
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := strings.TrimPrefix(f.Name, "./")
		if name == "" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(rc, 512*1024))
		rc.Close()
		if err != nil {
			continue
		}
		files = append(files, ClawHubSkillFile{Path: name, Content: string(data)})
	}
	return files, nil
}

func (c Connector) GetClawHubSkillMarkdown(ctx context.Context, baseURL, skillID string) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.TrimSpace(skillID) == "" {
		return "", fmt.Errorf("skill id is required")
	}
	if baseURL == "" || strings.Contains(baseURL, "example.com") {
		return "", nil
	}

	rawURL := baseURL + "/api/v1/skills/" + skillID + "/file?path=" + url.QueryEscape("SKILL.md")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("clawhub skill md returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return "", err
	}
	return string(body), nil
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
