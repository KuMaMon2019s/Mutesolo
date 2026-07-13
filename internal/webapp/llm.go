package webapp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	defaultOpenCodeBaseURL = "https://opencode.ai/zen/v1"
	defaultOpenCodeModel   = "mimo-v2.5-free"

	defaultArkBaseURL = "https://ark.cn-beijing.volces.com/api/plan/v3"
	defaultArkModel   = "ark-code-latest"
)

var defaultOpenCodeFallbackModels = []string{
	defaultOpenCodeModel,
	"deepseek-v4-flash-free",
	"north-mini-code-free",
	"nemotron-3-ultra-free",
	"big-pickle",
}

type openCodeAPIError struct {
	Status  int
	Message string
	Code    string
}

func (e openCodeAPIError) Error() string {
	if e.Message != "" {
		return "OpenCode request failed: " + e.Message
	}
	if e.Status != 0 {
		return fmt.Sprintf("OpenCode request failed with status %d", e.Status)
	}
	return "OpenCode request failed"
}

type openCodeChatRequest struct {
	Model       string                `json:"model"`
	Messages    []openCodeChatMessage `json:"messages"`
	Temperature float64               `json:"temperature,omitempty"`
}

type openCodeChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openCodeChatResponse struct {
	Choices []struct {
		Message openCodeChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type,omitempty"`
		Code    string `json:"code,omitempty"`
	} `json:"error,omitempty"`
}

// Ark API multimodal types (OpenAI-compatible)

type arkContentPart struct {
	Type     string       `json:"type"`
	Text     string       `json:"text,omitempty"`
	ImageURL *arkImageURL `json:"image_url,omitempty"`
}

type arkImageURL struct {
	URL string `json:"url"`
}

type arkMultimodalMessage struct {
	Role    string           `json:"role"`
	Content []arkContentPart `json:"content"`
}

type arkChatRequest struct {
	Model       string                 `json:"model"`
	Messages    []arkMultimodalMessage `json:"messages"`
	Temperature float64                `json:"temperature"`
	TopP        float64                `json:"top_p"`
}

type arkChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func GenerateOpenCodePrompt(ctx context.Context, llm LLMRequest, controlledInput string) (string, error) {
	return generateOpenCodePrompt(ctx, llm, controlledInput, &http.Client{Timeout: 60 * time.Second})
}

func TestOpenCodeConnection(ctx context.Context, llm LLMRequest) (string, error) {
	return GenerateOpenCodePrompt(ctx, llm, "只回复 pong")
}

func LLMRequestFromConfig(cfg Config) LLMRequest {
	return LLMRequest{
		Provider: "opencode",
		Model:    defaultOpenCodeModel,
		APIKey:   cfg.OpenCodeAPIKey,
		BaseURL:  defaultOpenCodeBaseURL,
	}
}

func MergeLLMRequest(saved Config, input LLMRequest) LLMRequest {
	if strings.TrimSpace(input.Provider) == "" {
		input.Provider = "opencode"
	}
	if strings.TrimSpace(input.Model) == "" {
		input.Model = defaultOpenCodeModel
	}
	if strings.TrimSpace(input.APIKey) == "" {
		input.APIKey = saved.OpenCodeAPIKey
	}
	if strings.TrimSpace(input.BaseURL) == "" {
		input.BaseURL = defaultOpenCodeBaseURL
	}
	return input
}

func generateOpenCodePrompt(ctx context.Context, llm LLMRequest, controlledInput string, client *http.Client) (string, error) {
	apiKey := strings.TrimSpace(llm.APIKey)
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("OPENCODE_API_KEY"))
	}
	if apiKey == "" {
		return "", fmt.Errorf("OpenCode API Key is required")
	}
	baseURL := strings.TrimRight(strings.TrimSpace(llm.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultOpenCodeBaseURL
	}
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}

	models := openCodeCandidateModels(llm.Model)
	var lastErr error
	for _, model := range models {
		prompt, err := requestOpenCodePrompt(ctx, client, baseURL, apiKey, model, controlledInput)
		if err == nil {
			return prompt, nil
		}
		lastErr = err
		if !isRetryableOpenCodeModelError(err) {
			break
		}
	}
	if len(models) > 1 && isRetryableOpenCodeModelError(lastErr) {
		return "", fmt.Errorf("%w; tried free models: %s", lastErr, strings.Join(models, ", "))
	}
	return "", lastErr
}

func openCodeCandidateModels(model string) []string {
	model = strings.TrimSpace(model)
	if model != "" && model != defaultOpenCodeModel {
		return []string{model}
	}
	candidates := make([]string, 0, len(defaultOpenCodeFallbackModels))
	seen := map[string]bool{}
	for _, candidate := range defaultOpenCodeFallbackModels {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		candidates = append(candidates, candidate)
	}
	return candidates
}

func requestOpenCodePrompt(ctx context.Context, client *http.Client, baseURL, apiKey, model, controlledInput string) (string, error) {
	body, err := json.Marshal(openCodeChatRequest{
		Model: model,
		Messages: []openCodeChatMessage{
			{
				Role:    "system",
				Content: "You convert structured local requirement context into one bounded AI agent implementation prompt. Never request local paths, localhost URLs, or browser blob URLs.",
			},
			{
				Role:    "user",
				Content: controlledInput,
			},
		},
		Temperature: 0.2,
	})
	if err != nil {
		return "", err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	var output openCodeChatResponse
	if err := json.NewDecoder(response.Body).Decode(&output); err != nil {
		return "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if output.Error != nil && output.Error.Message != "" {
			return "", openCodeAPIError{Status: response.StatusCode, Message: output.Error.Message, Code: output.Error.Code}
		}
		return "", openCodeAPIError{Status: response.StatusCode}
	}
	if output.Error != nil && output.Error.Message != "" {
		return "", openCodeAPIError{Status: response.StatusCode, Message: output.Error.Message, Code: output.Error.Code}
	}
	if len(output.Choices) == 0 {
		return "", fmt.Errorf("OpenCode response did not include choices")
	}
	prompt := strings.TrimSpace(output.Choices[0].Message.Content)
	if prompt == "" {
		return "", fmt.Errorf("OpenCode response was empty")
	}
	return prompt, nil
}

func isRetryableOpenCodeModelError(err error) bool {
	var apiErr openCodeAPIError
	if !errors.As(err, &apiErr) {
		return false
	}
	message := strings.ToLower(apiErr.Message)
	return strings.Contains(message, "model is disabled") ||
		strings.Contains(message, "model disabled") ||
		strings.Contains(message, "model not found") ||
		strings.Contains(message, "model_not_found")
}

// toDataURL downloads an image and returns a base64 data URL.
// If the URL is already a data URL or a publicly accessible https URL, it returns unchanged.
func toDataURL(ctx context.Context, rawURL string) (string, error) {
	if strings.HasPrefix(rawURL, "data:") {
		return rawURL, nil
	}
	if isPublicURL(rawURL) {
		return rawURL, nil
	}
	// Resolve absolute paths (e.g., /assets/..., /jassets/...) to the local backend.
	if strings.HasPrefix(rawURL, "/") {
		rawURL = "http://127.0.0.1:8787" + rawURL
	}
	// Private URL — download and convert to base64 data URL.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download image returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB max
	if err != nil {
		return "", err
	}
	mime := resp.Header.Get("Content-Type")
	if mime == "" {
		mime = "image/png"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func isPublicURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "" || host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return false
	}
	return strings.HasPrefix(u.Scheme, "http")
}

// GenerateMultimodalPrompt generates an AI agent prompt from structured context and optional images.
// Requires Ark API Key configured in Connections; returns error if not configured.
func GenerateMultimodalPrompt(ctx context.Context, cfg Config, text string, imageURLs []string) (string, error) {
	text = strings.TrimSpace(text)

	if strings.TrimSpace(cfg.ArkAPIKey) == "" {
		return "", fmt.Errorf("Ark API Key is required; please configure it in Connections")
	}

	prompt, err := generateArkMultimodalPrompt(ctx, cfg.ArkAPIKey, text, imageURLs)
	if err != nil {
		return "", fmt.Errorf("Ark API multimodal prompt failed: %w", err)
	}
	return prompt, nil
}

func generateArkMultimodalPrompt(ctx context.Context, apiKey, text string, imageURLs []string) (string, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return "", fmt.Errorf("Ark API key is empty")
	}

	content := make([]arkContentPart, 0, 1+len(imageURLs))
	content = append(content, arkContentPart{Type: "text", Text: text})
	for _, imgURL := range imageURLs {
		imgURL = strings.TrimSpace(imgURL)
		if imgURL == "" {
			continue
		}
		// Convert private/local URLs to base64 data URLs; pass public URLs directly.
		dataURL, err := toDataURL(ctx, imgURL)
		if err != nil {
			return "", fmt.Errorf("convert image %s to data URL: %w", imgURL, err)
		}
		content = append(content, arkContentPart{
			Type:     "image_url",
			ImageURL: &arkImageURL{URL: dataURL},
		})
	}

	body, err := json.Marshal(arkChatRequest{
		Model: defaultArkModel,
		Messages: []arkMultimodalMessage{
			{
				Role:    "user",
				Content: content,
			},
		},
		Temperature: 0,
		TopP:        1,
	})
	if err != nil {
		return "", err
	}

	url := defaultArkBaseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var output arkChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if output.Error != nil && output.Error.Message != "" {
			return "", fmt.Errorf("Ark API error (status %d): %s", resp.StatusCode, output.Error.Message)
		}
		return "", fmt.Errorf("Ark API returned status %d", resp.StatusCode)
	}
	if output.Error != nil && output.Error.Message != "" {
		return "", fmt.Errorf("Ark API error: %s", output.Error.Message)
	}
	if len(output.Choices) == 0 {
		return "", fmt.Errorf("Ark API response did not include choices")
	}
	prompt := strings.TrimSpace(output.Choices[0].Message.Content)
	if prompt == "" {
		return "", fmt.Errorf("Ark API response was empty")
	}
	return prompt, nil
}
