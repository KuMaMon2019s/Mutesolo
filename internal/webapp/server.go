package webapp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"Mutesolo/internal/storage"
)

type Server struct {
	store      Repository
	connector  Connector
	staticDir  string
	minio      *storage.Client
}

func NewServer(store Repository, staticDir string, minioClient *storage.Client) Server {
	return Server{
		store:      store,
		connector:  NewConnector(),
		staticDir:  staticDir,
		minio:      minioClient,
	}
}

func (s Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(envOrDefault("MUTESOLO_ASSET_FALLBACK_DIR", ".ai-agent/assets")))))
	mux.Handle("/apps/requirement-editor/", http.StripPrefix("/apps/requirement-editor/", http.FileServer(http.Dir(filepath.Join("webapps", "requirement-editor", "dist")))))
	mux.HandleFunc("/", s.handleControlConsole)
	mux.HandleFunc("/api/state", s.handleState)
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/ai-agent/status", s.handleAIAgentStatus)
	mux.HandleFunc("/api/ai-agent/screenshot-members", s.handleAIAgentScreenshotMembers)
	mux.HandleFunc("/api/members", s.handleMembers)
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/agent-workload", s.handleAgentWorkload)
	mux.HandleFunc("/api/agent-tasks", s.handleAgentTasks)
	mux.HandleFunc("/api/discord/members", s.handleDiscordMembers)
	mux.HandleFunc("/api/tailscale/devices", s.handleTailscaleDevices)
	mux.HandleFunc("/api/clawhub/skills", s.handleClawHubSkills)
	mux.HandleFunc("/api/clawhub/skills/", s.handleClawHubSkillActions)
	mux.HandleFunc("/api/plugin-runtimes", s.handlePluginRuntimes)
	mux.HandleFunc("/api/assets", s.handleAssets)
	mux.HandleFunc("/api/documents/parse", s.handleDocumentParse)
	mux.HandleFunc("/api/llm/test", s.handleLLMTest)
	mux.HandleFunc("/api/projects", s.handleProjects)
	mux.HandleFunc("/api/projects/", s.handleProjectActions)
	mux.HandleFunc("/api/generate-prompt", s.handleGeneratePrompt)
	mux.HandleFunc("/api/github/push", s.handleGitHubPush)
	mux.HandleFunc("/api/github/repos", s.handleGitHubRepos)
	mux.HandleFunc("/api/github/repos/", s.handleGitHubReleases)
	// Auth routes (SQLite backend only)
	if ss, ok := s.store.(*SQLiteStore); ok {
		mux.Handle("/api/me", RequireUser(ss)(http.HandlerFunc(s.handleMe)))
		mux.Handle("/auth/password", RequireUser(ss)(http.HandlerFunc(s.handleChangePassword)))
	} else {
		mux.HandleFunc("/api/me", func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusNotImplemented, "auth requires sqlite backend")
		})
	}
	mux.HandleFunc("/auth/login", s.handleAuthLogin)
	mux.HandleFunc("/auth/register", s.handleAuthRegister)
	mux.HandleFunc("/auth/logout", s.handleAuthLogout)
	return mux
}

func (s Server) handleControlConsole(w http.ResponseWriter, r *http.Request) {
	// Try Vite dev server first (development mode)
	devProxy := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: "http", Host: "localhost:5175"})
	devProxy.ErrorHandler = func(_ http.ResponseWriter, _ *http.Request, _ error) {
		// Fall back to serving built dist directory (production mode) with SPA fallback
		distDir := filepath.Join("webapps", "control-console", "dist")
		// Check if the requested file exists on disk
		reqPath := r.URL.Path
		if reqPath == "/" {
			reqPath = "/index.html"
		}
		filePath := filepath.Join(distDir, filepath.Clean(reqPath))
		if _, err := os.Stat(filePath); err != nil {
			// SPA fallback: serve index.html for unknown routes
			http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
			return
		}
		http.FileServer(http.Dir(distDir)).ServeHTTP(w, r)
	}
	devProxy.ServeHTTP(w, r)
}

func (s Server) handleAssets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetUploadBytes+1024*1024)
	if err := r.ParseMultipartForm(maxAssetUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid asset upload: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxAssetUploadBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read file: "+err.Error())
		return
	}
	if len(data) > maxAssetUploadBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "asset exceeds 32 MiB")
		return
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	result, err := AssetStorageFromEnv().Upload(r.Context(), header.Filename, contentType, data)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	// Track asset ref if project_id is provided.
	projectID := strings.TrimSpace(r.FormValue("project_id"))
	requirementID := strings.TrimSpace(r.FormValue("requirement_id"))
	if projectID != "" {
		ref := AssetRef{
			AssetID:       result.ID,
			ProjectID:     projectID,
			RequirementID: requirementID,
			StorageKey:    result.StorageKey,
			URL:           result.URL,
			Source:        result.Source,
		}
		if err := s.saveAssetRef(ref); err != nil {
			log.Printf("save asset ref %s: %v", result.ID, err)
		}
	}

	writeJSON(w, result)
}

func (s Server) handleClawHubSkillActions(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/clawhub/skills/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "skill not found")
		return
	}
	skillID := parts[0]
	if len(parts) == 1 && r.Method == http.MethodGet {
		s.handleClawHubSkillDetail(w, r, skillID)
		return
	}
	if len(parts) == 2 && parts[1] == "install" && r.Method == http.MethodPost {
		s.handleClawHubSkillInstall(w, r, skillID)
		return
	}
	if len(parts) == 2 && parts[1] == "cover" && r.Method == http.MethodGet {
		s.handleClawHubSkillCover(w, r, skillID)
		return
	}
	writeError(w, http.StatusNotFound, "unknown skill action")
}

func (s Server) handleClawHubSkillDetail(w http.ResponseWriter, r *http.Request, skillID string) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	skill, err := s.connector.GetClawHubSkill(r.Context(), state.Config.ClawHubBaseURL, skillID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	markdown, _ := s.connector.GetClawHubSkillMarkdown(r.Context(), state.Config.ClawHubBaseURL, skillID)
	files, _ := s.connector.GetClawHubSkillFiles(r.Context(), state.Config.ClawHubBaseURL, skillID)
	writeJSON(w, struct {
		SkillSummary
		Markdown string               `json:"markdown,omitempty"`
		Files    []ClawHubSkillFile `json:"files,omitempty"`
	}{
		SkillSummary: skill,
		Markdown:     markdown,
		Files:        files,
	})
}

func (s Server) handleClawHubSkillInstall(w http.ResponseWriter, r *http.Request, skillID string) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var input SkillInstallRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.SkillID = skillID
	result, err := s.connector.InstallSkillOnAIAgent(r.Context(), state.Config.AIAgentBaseURL, state.Config.AIAgentToken, state.Config.ClawHubBaseURL, input)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s Server) handleClawHubSkillCover(w http.ResponseWriter, r *http.Request, skillID string) {
	state, err := s.store.Load()
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	baseURL := strings.TrimRight(strings.TrimSpace(state.Config.ClawHubBaseURL), "/")
	if baseURL == "" || strings.Contains(baseURL, "example.com") {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Step 1: Get skill detail from ClawHub to find SKILL.md file
	detailURL := baseURL + "/api/v1/skills/" + skillID
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, detailURL, nil)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var detail struct {
		LatestVersion struct {
			Files []struct {
				Path string `json:"path"`
			} `json:"files"`
		} `json:"latestVersion"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Step 2: Find SKILL.md in files
	skillMDPath := ""
	for _, f := range detail.LatestVersion.Files {
		if f.Path == "SKILL.md" || strings.HasSuffix(f.Path, "/SKILL.md") {
			skillMDPath = f.Path
			break
		}
	}
	if skillMDPath == "" {
		// No SKILL.md found
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Step 3: Download SKILL.md content
	rawURL := baseURL + "/api/v1/skills/" + skillID + "/files/" + skillMDPath
	req2, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	defer resp2.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp2.Body, 512*1024))
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Step 4: Parse first image URL from SKILL.md
	// Match markdown image syntax: ![alt](url)
	content := string(body)
	imageRe := regexp.MustCompile(`!\[.*?\]\((https?://[^\)]+)\)`)
	matches := imageRe.FindStringSubmatch(content)
	if len(matches) > 1 {
		http.Redirect(w, r, matches[1], http.StatusFound)
		return
	}

	// No image found in SKILL.md
	w.WriteHeader(http.StatusNoContent)
}

func (s Server) handlePluginRuntimes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, SupportedPluginRuntimes())
}

func (s Server) handleState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, state)
}

func (s Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, state.Config)
	case http.MethodPut:
		var incoming map[string]any
		if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		mergeString := func(target *string, key string) {
			if v, ok := incoming[key]; ok {
				if s, isStr := v.(string); isStr {
					*target = s
				}
			}
		}
		mergeBool := func(target *bool, key string) {
			if v, ok := incoming[key]; ok {
				if b, isBool := v.(bool); isBool {
					*target = b
				}
			}
		}
		mergeString(&state.Config.AIAgentBaseURL, "ai_agent_base_url")
		mergeString(&state.Config.AIAgentToken, "ai_agent_token")
		mergeString(&state.Config.GitHubRepo, "github_repo")
		mergeString(&state.Config.DiscordURL, "discord_url")
		mergeString(&state.Config.DiscordWidgetURL, "discord_widget_url")
		mergeString(&state.Config.DiscordBotID, "discord_bot_id")
		mergeString(&state.Config.DiscordGuildID, "discord_guild_id")
		mergeString(&state.Config.DiscordBotUsername, "discord_bot_username")
		mergeString(&state.Config.ClawHubBaseURL, "clawhub_base_url")
		mergeString(&state.Config.ClawHubAPIKey, "clawhub_api_key")
		mergeString(&state.Config.OpenCodeAPIKey, "opencode_api_key")
		mergeString(&state.Config.ArkAPIKey, "ark_api_key")
		mergeString(&state.Config.GitHubToken, "github_token")
		mergeBool(&state.Config.LLMLocked, "llm_locked")
		if err := s.store.Save(state); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, state.Config)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s Server) handleAIAgentStatus(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, s.connector.CheckAIAgent(r.Context(), state.Config.DiscordGuildID, state.Config.DiscordBotUsername))
}

func (s Server) handleAIAgentScreenshotMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	widgetURL := strings.TrimSpace(state.Config.DiscordWidgetURL)
	if widgetURL == "" {
		// Fallback: construct widget URL from guild ID.
		guildID := strings.TrimSpace(state.Config.DiscordGuildID)
		if guildID == "" {
			writeJSON(w, ScreenshotResult{Error: "discord widget URL or guild ID not configured"})
			return
		}
		widgetURL = fmt.Sprintf("https://discord.com/widget?id=%s&theme=dark", guildID)
	}
	// Extract real URL from iframe HTML if needed.
	widgetURL = extractIframeSrc(widgetURL)
	result := GetCachedMembers(r.Context(), widgetURL)

	// Persist members to Repository so other pages can pick them up.
	if len(result.Members) > 0 {
		members := make([]Member, len(result.Members))
		for i, sm := range result.Members {
			members[i] = Member{
				Username: sm.Username,
				Status:   sm.Status,
			}
		}
		if err := s.store.SaveMembers(members); err != nil {
			// Log but don't fail the request — cache is still served.
			fmt.Printf("save members to store: %v\n", err)
		}
	}

	writeJSON(w, result)
}

func (s Server) handleMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	members, err := s.store.LoadMembers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"members": members})
}

func (s Server) handleDiscordMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	members, err := s.connector.GetDiscordMembers(r.Context(), state.Config.DiscordGuildID)
	if err != nil {
		writeJSON(w, map[string]any{"members": []DiscordMember{}, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"members": members})
}

func (s Server) handleTailscaleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	writeJSON(w, ReadTailscaleDevices(ctx))
}

func (s Server) handleClawHubSkills(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	skills, err := s.connector.ListClawHubSkills(r.Context(), state.Config.ClawHubBaseURL, state.Config.ClawHubAPIKey)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, skills)
}

func (s Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, state.Projects)
	case http.MethodPost:
		var input Project
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if strings.TrimSpace(input.Name) == "" {
			writeError(w, http.StatusBadRequest, "project name is required")
			return
		}
		project := UpsertProject(&state, input)
		if err := s.store.Save(state); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Upload cover image in background (non-blocking).
		go s.uploadCoverForProject(project.ID)

		writeJSON(w, project)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// uploadCoverForProject downloads a random picsum image and uploads it to MinIO.
func (s Server) uploadCoverForProject(projectID string) {
	if s.minio == nil {
		return
	}
	imageURL := picSumCoverURL(projectID)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	data, contentType, err := storage.DownloadImage(ctx, imageURL)
	if err != nil {
		log.Printf("download cover for %s: %v", projectID, err)
		return
	}
	url, err := s.minio.UploadImage(ctx, projectID, data, contentType)
	if err != nil {
		log.Printf("upload cover for %s: %v", projectID, err)
		return
	}
	// Save to project_images table if the store is SQLite.
	if ss, ok := s.store.(*SQLiteStore); ok {
		if err := ss.SaveProjectImage(projectID, url); err != nil {
			log.Printf("save project_image for %s: %v", projectID, err)
		}
	}
}

// picSumCoverURL generates the old-style picsum URL for a project ID.
func picSumCoverURL(projectID string) string {
	var hash uint32
	for _, c := range projectID {
		hash = (hash*31 + uint32(c))
	}
	return fmt.Sprintf("https://picsum.photos/seed/%d/400/%d", hash%1000, 200+(hash%200))
}

// handleProjectImage serves the cover image URL (or redirects) for a project.
func (s Server) handleProjectImage(w http.ResponseWriter, r *http.Request, projectID string) {
	// Try SQLite store first.
	if ss, ok := s.store.(*SQLiteStore); ok {
		url, found, err := ss.GetProjectImageURL(projectID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if found && url != "" {
			http.Redirect(w, r, url, http.StatusFound)
			return
		}
	}
	// For JSON store (or fallback), check project's CoverURL field.
	if state, err := s.store.Load(); err == nil {
		for _, p := range state.Projects {
			if p.ID == projectID {
				// Generate presigned URL (valid 10 minutes) and redirect.
				if s.minio != nil {
					ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
					presigned, err := s.minio.PresignedGetURL(ctx, projectID, 10*time.Minute)
					cancel()
					if err == nil {
						http.Redirect(w, r, presigned, http.StatusFound)
						return
					}
				}
				// Fallback: picsum
				http.Redirect(w, r, picSumCoverURL(projectID), http.StatusFound)
				return
			}
		}
	}
	// Fallback: generate picsum URL.
	writeJSON(w, map[string]string{"url": picSumCoverURL(projectID)})
}

// handleProjectDelete removes a project from state and cleans up MinIO + assets.
func (s Server) handleProjectDelete(w http.ResponseWriter, r *http.Request, projectID string) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Collect asset refs for cleanup before removing the project.
	assetRefs, _ := s.getAssetRefsByProject(projectID)

	// Find and remove the project.
	found := false
	filtered := make([]Project, 0, len(state.Projects))
	for _, p := range state.Projects {
		if p.ID == projectID {
			found = true
			// Delete cover image from MinIO in background.
			if s.minio != nil {
				go func() {
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()
					if err := s.minio.DeleteImage(ctx, projectID); err != nil {
						log.Printf("minio delete image for %s: %v", projectID, err)
					}
				}()
			}
			continue
		}
		filtered = append(filtered, p)
	}
	if !found {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	state.Projects = filtered
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Clean up asset refs from MinIO and store.
	s.deleteAssetRefsAndMinIO(assetRefs, projectID, "")

	writeJSON(w, map[string]string{"status": "deleted", "project_id": projectID})
}

func (s Server) handleProjectActions(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/projects/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "unknown project action")
		return
	}
	projectID := parts[0]

	// DELETE /api/projects/{id}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		s.handleProjectDelete(w, r, projectID)
		return
	}

	// GET /api/projects/{id}/image
	if len(parts) == 2 && parts[1] == "image" && r.Method == http.MethodGet {
		s.handleProjectImage(w, r, projectID)
		return
	}

	if len(parts) < 2 {
		writeError(w, http.StatusNotFound, "unknown project action")
		return
	}
	action := parts[1]
	switch action {
	case "branches":
		if len(parts) == 3 {
			s.handleBranchDetail(w, r, projectID, parts[2])
			return
		}
		s.handleBranches(w, r, projectID)
	case "requirements":
		if len(parts) == 3 {
			s.handleRequirementDetail(w, r, projectID, parts[2])
			return
		}
		s.handleRequirements(w, r, projectID)
	case "prompt":
		s.handlePrompt(w, r, projectID)
	case "send":
		s.handleSendPrompt(w, r, projectID)
	case "board":
		s.handleBoardUpdate(w, r, projectID)
	default:
		writeError(w, http.StatusNotFound, "unknown project action")
	}
}

func (s Server) handleBranches(w http.ResponseWriter, r *http.Request, projectID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	branch, ok := AddBranch(&state, projectID, input.Name)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, branch)
}

func (s Server) handleBranchDetail(w http.ResponseWriter, r *http.Request, projectID string, branchID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !RemoveBranch(&state, projectID, branchID) {
		writeError(w, http.StatusNotFound, "branch not found")
		return
	}
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s Server) handleRequirements(w http.ResponseWriter, r *http.Request, projectID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var input Requirement
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(input.Title) == "" {
		writeError(w, http.StatusBadRequest, "requirement title is required")
		return
	}
	req, ok := AddRequirement(&state, projectID, input)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, req)
}

func (s Server) handleRequirementDetail(w http.ResponseWriter, r *http.Request, projectID string, reqID string) {
	switch r.Method {
	case http.MethodPut:
		s.handleRequirementUpdate(w, r, projectID, reqID)
	case http.MethodDelete:
		s.handleRequirementDelete(w, r, projectID, reqID)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s Server) handleRequirementUpdate(w http.ResponseWriter, r *http.Request, projectID string, reqID string) {
	var input Requirement
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(input.Title) == "" {
		writeError(w, http.StatusBadRequest, "requirement title is required")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req, ok := UpdateRequirementDetails(&state, projectID, reqID, input)
	if !ok {
		writeError(w, http.StatusNotFound, "requirement not found")
		return
	}
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, req)
}

func (s Server) handleRequirementDelete(w http.ResponseWriter, r *http.Request, projectID string, reqID string) {
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Collect asset refs for cleanup before removing.
	assetRefs, _ := s.getAssetRefsByRequirement(projectID, reqID)

	found := false
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		filtered := make([]Requirement, 0, len(state.Projects[pi].Requirements))
		for _, r := range state.Projects[pi].Requirements {
			if r.ID == reqID {
				found = true
				continue
			}
			filtered = append(filtered, r)
		}
		if !found {
			break
		}
		state.Projects[pi].Requirements = filtered
		state.Projects[pi].UpdatedAt = time.Now().UTC()
		break
	}
	if !found {
		writeError(w, http.StatusNotFound, "requirement not found")
		return
	}
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Clean up asset refs from MinIO and store.
	s.deleteAssetRefsAndMinIO(assetRefs, projectID, reqID)

	writeJSON(w, map[string]string{"status": "deleted", "requirement_id": reqID})
}

func (s Server) handlePrompt(w http.ResponseWriter, r *http.Request, projectID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input ProjectPromptRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	project, ok := FindProject(state, projectID)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	req, ok := FindRequirement(project, input.RequirementID)
	if !ok {
		writeError(w, http.StatusNotFound, "requirement not found")
		return
	}
	editor := RequirementEditorPromptRequest{
		Blocks:      input.Blocks,
		TencentDocs: input.TencentDocs,
		Attachments: input.Attachments,
		PlainText:   input.PlainText,
	}
	if strings.TrimSpace(editor.PlainText) == "" && strings.TrimSpace(req.Description) != "" {
		editor.PlainText = req.Description
	}
	controlledInput := BuildLLMPromptInput(project, req, editor)
	prompt, err := GenerateOpenCodePrompt(r.Context(), MergeLLMRequest(state.Config, input.LLM), controlledInput)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	result, err := StorePromptArtifact(project, req, prompt, "artifacts")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result.DiscordText = BuildDiscordMessageForBot(project, req, prompt, state.Config.DiscordBotID)
	if err := s.savePromptToRequirement(&state, projectID, input.RequirementID, prompt); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s Server) savePromptToRequirement(state *State, projectID string, reqID string, prompt string) error {
	for pi := range state.Projects {
		if state.Projects[pi].ID != projectID {
			continue
		}
		for ri := range state.Projects[pi].Requirements {
			if state.Projects[pi].Requirements[ri].ID != reqID {
				continue
			}
			state.Projects[pi].Requirements[ri].Prompt = prompt
			state.Projects[pi].Requirements[ri].UpdatedAt = time.Now().UTC()
			return s.store.Save(*state)
		}
	}
	return nil
}

func (s Server) handleSendPrompt(w http.ResponseWriter, r *http.Request, projectID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input struct {
		RequirementID string `json:"requirement_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	project, ok := FindProject(state, projectID)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	req, ok := FindRequirement(project, input.RequirementID)
	if !ok {
		writeError(w, http.StatusNotFound, "requirement not found")
		return
	}
	prompt := BuildPrompt(project, req)
	result, err := s.connector.SendAIAgentPrompt(r.Context(), state.Config.AIAgentBaseURL, state.Config.AIAgentToken, prompt)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s Server) handleBoardUpdate(w http.ResponseWriter, r *http.Request, projectID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input BoardUpdate
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(input.RequirementIDs) == 0 {
		writeError(w, http.StatusBadRequest, "requirement_ids is required")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updated, ok := UpdateRequirements(&state, projectID, input)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	log.Printf("[board-update] project=%s ids=%v branch=%q status=%q -> updated=%d",
		projectID, input.RequirementIDs, input.BranchID, input.Status, len(updated))
	if err := s.store.Save(state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, updated)
}

func (s Server) handleGeneratePrompt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input RequirementEditorPromptRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Load state for config + full requirement content
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot load config")
		return
	}

	// Load full requirement from store if IDs provided
	var plainText string
	var attachments []RequirementEditorAttachment

	if input.ProjectID != "" && input.RequirementID != "" {
		// Read the full requirement content from storage
		for _, proj := range state.Projects {
			if proj.ID == input.ProjectID {
				for _, req := range proj.Requirements {
					if req.ID == input.RequirementID {
						plainText = extractPlainText(req.EditorContent)
						if len(req.Attachments) > 0 {
							json.Unmarshal(req.Attachments, &attachments)
						}
						break
					}
				}
				break
			}
		}
	}

	// Fallback to user-provided content if not loaded from storage
	if plainText == "" {
		plainText = input.PlainText
	}
	if len(attachments) == 0 {
		attachments = input.Attachments
	}

	// Build prompt text: send user's requirement directly, not a meta-prompt
	var promptBuilder strings.Builder
	promptBuilder.WriteString("Based on the following requirement and attached images, generate a concise implementation prompt for an AI coding agent. 保持内容精简。\n\n")
	promptBuilder.WriteString("Include only the essential:\n- Core implementation steps (≤5)\n- Key technical constraints\n- Expected outputs\n\n")
	promptBuilder.WriteString("Requirement content:\n")
	if strings.TrimSpace(plainText) != "" {
		promptBuilder.WriteString(plainText)
	} else {
		promptBuilder.WriteString("(No text provided — use attached images to understand the requirement)")
	}
	promptBuilder.WriteString("\n\nAttachments:\n")
	if len(attachments) > 0 {
		for _, a := range attachments {
			promptBuilder.WriteString(fmt.Sprintf("- %s (%s)\n", a.Name, a.MIMEType))
		}
	} else {
		promptBuilder.WriteString("- None\n")
	}
	text := promptBuilder.String()

	// Extract image URLs from attachments (object-storage URLs)
	var imageURLs []string
	for _, a := range attachments {
		if isImageAttachment(a) && strings.TrimSpace(a.URL) != "" {
			imageURLs = append(imageURLs, a.URL)
		}
	}

	// Call LLM (requires Ark API Key in Connections)
	prompt, err := GenerateMultimodalPrompt(r.Context(), state.Config, text, imageURLs)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, map[string]any{"prompt": prompt})
}

func isImageAttachment(a RequirementEditorAttachment) bool {
	if strings.EqualFold(a.Kind, "image") {
		return true
	}
	return strings.HasPrefix(strings.ToLower(a.MIMEType), "image/")
}

// extractPlainText extracts human-readable text from the editor content JSON.
func extractPlainText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	// Try to extract text from common editor formats
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return string(raw)
	}
	// Recursively collect text nodes
	var texts []string
	collectText(doc, &texts)
	return strings.TrimSpace(strings.Join(texts, "\n"))
}

func collectText(node any, texts *[]string) {
	switch v := node.(type) {
	case map[string]any:
		if t, ok := v["text"]; ok {
			if s, ok := t.(string); ok && strings.TrimSpace(s) != "" {
				*texts = append(*texts, s)
			}
		}
		for _, val := range v {
			collectText(val, texts)
		}
	case []any:
		for _, val := range v {
			collectText(val, texts)
		}
	}
}

func (s Server) handleLLMTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var input LLMTestRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	response, err := TestOpenCodeConnection(r.Context(), MergeLLMRequest(state.Config, input.LLM))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	ok := strings.EqualFold(strings.TrimSpace(response), "pong")
	writeJSON(w, map[string]any{
		"ok":       ok,
		"expected": "pong",
		"response": response,
	})
}

func (s Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	projectID := r.URL.Query().Get("project_id")
	branchID := r.URL.Query().Get("branch_id")

	stats, err := s.store.LoadStats(projectID, branchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, stats)
}

// handleAgentWorkload returns task counts per agent across all projects.
func (s Server) handleAgentWorkload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type AgentWorkload struct {
		Agent      string   `json:"agent"`
		Backlog    int      `json:"backlog"`
		Todo       int      `json:"todo"`
		InProgress int      `json:"in_progress"`
		Done       int      `json:"done"`
		Projects   []string `json:"projects"`
	}

	workloads := make(map[string]*AgentWorkload)
	projectSets := make(map[string]map[string]struct{})
	for _, proj := range state.Projects {
		for _, req := range proj.Requirements {
			member := strings.TrimSpace(req.AssignedMember)
			if member == "" {
				continue
			}
			wl, ok := workloads[member]
			if !ok {
				wl = &AgentWorkload{Agent: member}
				workloads[member] = wl
			}
			switch req.Status {
			case "draft", "":
				wl.Backlog++
			case "sent":
				wl.Todo++
			case "in_progress":
				wl.InProgress++
			case "closed":
				wl.Done++
			}
			if ps, ok := projectSets[member]; ok {
				ps[proj.ID] = struct{}{}
			} else {
				projectSets[member] = map[string]struct{}{proj.ID: struct{}{}}
			}
		}
	}

	result := make([]AgentWorkload, 0, len(workloads))
	for _, wl := range workloads {
		if ps, ok := projectSets[wl.Agent]; ok {
			for pid := range ps {
				wl.Projects = append(wl.Projects, pid)
			}
		}
		result = append(result, *wl)
	}

	writeJSON(w, result)
}

// handleAgentTasks returns all tasks for a given agent across all projects and branches.
func (s Server) handleAgentTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	member := r.URL.Query().Get("member")
	if member == "" {
		writeError(w, http.StatusBadRequest, "member query param is required")
		return
	}
	projectID := r.URL.Query().Get("project_id")

	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type AgentTask struct {
		ProjectID      string `json:"project_id"`
		ProjectName    string `json:"project_name"`
		BranchID       string `json:"branch_id"`
		BranchName     string `json:"branch_name"`
		RequirementID  string `json:"requirement_id"`
		Title          string `json:"title"`
		Status         string `json:"status"`
		Priority       string `json:"priority"`
	}

	tasks := make([]AgentTask, 0)
	for _, proj := range state.Projects {
		branches := proj.Branches
		if len(branches) == 0 {
			branches = []ProjectBranch{{ID: "main", Name: "Main"}}
		}
		branchMap := make(map[string]string, len(branches))
		for _, b := range branches {
			branchMap[b.ID] = b.Name
		}
		for _, req := range proj.Requirements {
			if req.AssignedMember != member {
				continue
			}
			branchName := branchMap[req.BranchID]
			if branchName == "" {
				branchName = branchMap["main"]
			}
			if branchName == "" {
				branchName = req.BranchID
			}
			if req.Status == "" {
				req.Status = "draft"
			}
			if req.Priority == "" {
				req.Priority = "no_priority"
			}
			tasks = append(tasks, AgentTask{
				ProjectID:     proj.ID,
				ProjectName:   proj.Name,
				BranchID:      req.BranchID,
				BranchName:    branchName,
				RequirementID: req.ID,
				Title:         req.Title,
				Status:        req.Status,
				Priority:      req.Priority,
			})
		}
	}

	// Filter by project_id if provided.
	if projectID != "" {
		filtered := make([]AgentTask, 0, len(tasks))
		for _, t := range tasks {
			if t.ProjectID == projectID {
				filtered = append(filtered, t)
			}
		}
		tasks = filtered
	}

	writeJSON(w, map[string]any{"agent": member, "tasks": tasks})
}

func (s Server) handleGitHubPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := runGit("status", "--short"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := runGit("push"); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "pushed"})
}

func runGit(args ...string) error {
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	if args[0] == "status" && strings.TrimSpace(string(out)) != "" {
		return errors.New("working tree has uncommitted changes; commit before pushing")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Asset Ref helpers – dispatch to SQLite or JSON store
// ---------------------------------------------------------------------------

func (s Server) saveAssetRef(ref AssetRef) error {
	if ss, ok := s.store.(*SQLiteStore); ok {
		return ss.SaveAssetRef(ref)
	}
	// JSON store: add to State.AssetRefs.
	state, err := s.store.Load()
	if err != nil {
		return err
	}
	state.AssetRefs = append(state.AssetRefs, ref)
	return s.store.Save(state)
}

func (s Server) getAssetRefsByProject(projectID string) ([]AssetRef, error) {
	if ss, ok := s.store.(*SQLiteStore); ok {
		return ss.GetAssetRefsByProject(projectID)
	}
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	var refs []AssetRef
	for _, r := range state.AssetRefs {
		if r.ProjectID == projectID {
			refs = append(refs, r)
		}
	}
	return refs, nil
}

func (s Server) getAssetRefsByRequirement(projectID, requirementID string) ([]AssetRef, error) {
	if ss, ok := s.store.(*SQLiteStore); ok {
		return ss.GetAssetRefsByRequirement(projectID, requirementID)
	}
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	var refs []AssetRef
	for _, r := range state.AssetRefs {
		if r.ProjectID == projectID && r.RequirementID == requirementID {
			refs = append(refs, r)
		}
	}
	return refs, nil
}

// deleteAssetRefsAndMinIO deletes asset refs from the store and cleans up
// MinIO + local files for each referenced asset.
func (s Server) deleteAssetRefsAndMinIO(refs []AssetRef, projectID, requirementID string) {
	if len(refs) == 0 {
		return
	}
	storage := AssetStorageFromEnv()
	for _, ref := range refs {
		go func(key string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := storage.Delete(ctx, key); err != nil {
				log.Printf("minio delete asset %s: %v", key, err)
			}
		}(ref.StorageKey)
	}

	// Remove from store.
	if requirementID != "" {
		if err := s.deleteAssetRefsByRequirement(projectID, requirementID); err != nil {
			log.Printf("delete asset refs for requirement %s/%s: %v", projectID, requirementID, err)
		}
	} else {
		if err := s.deleteAssetRefsByProject(projectID); err != nil {
			log.Printf("delete asset refs for project %s: %v", projectID, err)
		}
	}
}

func (s Server) deleteAssetRefsByProject(projectID string) error {
	if ss, ok := s.store.(*SQLiteStore); ok {
		return ss.DeleteAssetRefsByProject(projectID)
	}
	state, err := s.store.Load()
	if err != nil {
		return err
	}
	filtered := make([]AssetRef, 0, len(state.AssetRefs))
	for _, r := range state.AssetRefs {
		if r.ProjectID != projectID {
			filtered = append(filtered, r)
		}
	}
	state.AssetRefs = filtered
	return s.store.Save(state)
}

func (s Server) deleteAssetRefsByRequirement(projectID, requirementID string) error {
	if ss, ok := s.store.(*SQLiteStore); ok {
		return ss.DeleteAssetRefsByRequirement(projectID, requirementID)
	}
	state, err := s.store.Load()
	if err != nil {
		return err
	}
	filtered := make([]AssetRef, 0, len(state.AssetRefs))
	for _, r := range state.AssetRefs {
		if !(r.ProjectID == projectID && r.RequirementID == requirementID) {
			filtered = append(filtered, r)
		}
	}
	state.AssetRefs = filtered
	return s.store.Save(state)
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
