package webapp

import "time"

type Config struct {
	OpenClawBaseURL string `json:"openclaw_base_url"`
	GitHubRepo      string `json:"github_repo"`
	ClawHubBaseURL  string `json:"clawhub_base_url"`
	LLMBaseURL      string `json:"llm_base_url"`
}

type Project struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Description  string        `json:"description"`
	Plan         string        `json:"plan"`
	Docs         string        `json:"docs"`
	Requirements []Requirement `json:"requirements"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

type Requirement struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	Prompt      string    `json:"prompt,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type OpenClawStatus struct {
	Online    bool   `json:"online"`
	BaseURL   string `json:"base_url"`
	AgentID   string `json:"agent_id,omitempty"`
	Name      string `json:"name,omitempty"`
	Version   string `json:"version,omitempty"`
	Error     string `json:"error,omitempty"`
	CheckedAt string `json:"checked_at"`
}

type SkillSummary struct {
	ID           string   `json:"id"`
	Name         string   `json:"name,omitempty"`
	Version      string   `json:"version,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
}

type PromptResult struct {
	ProjectID     string   `json:"project_id"`
	RequirementID string   `json:"requirement_id"`
	Segments      []string `json:"segments"`
	ArtifactPath  string   `json:"artifact_path"`
}
