package webapp

import (
	"context"
	"encoding/json"
	"fmt"
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

func (c Connector) CheckOpenClaw(ctx context.Context, baseURL string) OpenClawStatus {
	status := OpenClawStatus{
		BaseURL:   baseURL,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" || strings.Contains(baseURL, "100.x.y.z") {
		status.Error = "configure a Tailscale OpenClaw URL"
		return status
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/.well-known/agent-card.json", nil)
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
		status.Error = fmt.Sprintf("agent card returned HTTP %d", resp.StatusCode)
		return status
	}

	var card map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&card); err != nil {
		status.Error = err.Error()
		return status
	}
	status.Online = true
	status.Name = stringField(card, "name")
	status.AgentID = firstString(card, "id", "agentId", "agent_id")
	status.Version = stringField(card, "version")
	return status
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
