package webapp

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── GitHub API response types ──

type GitHubRepo struct {
	ID              int    `json:"id"`
	Name            string `json:"name"`
	FullName        string `json:"full_name"`
	Description     string `json:"description"`
	Language        string `json:"language"`
	Private         bool   `json:"private"`
	Fork            bool   `json:"fork"`
	ParentFullName  string `json:"parent_full_name"`
	StargazersCount int    `json:"stargazers_count"`
	ForksCount      int    `json:"forks_count"`
	License         string `json:"license"`
	PushedAt        string `json:"pushed_at"`
	UpdatedAt       string `json:"updated_at"`
}

type GitHubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	PublishedAt string `json:"published_at"`
	HTMLURL     string `json:"html_url"`
}

type GitHubReleasesResponse struct {
	Releases     []GitHubRelease `json:"releases"`
	LatestPublishAt string       `json:"latest_publish_at"`
}

// ── Cache ──

type reposCacheEntry struct {
	data      []GitHubRepo
	timestamp time.Time
}

type releasesCacheEntry struct {
	data      GitHubReleasesResponse
	timestamp time.Time
}

var (
	reposCache     = map[string]*reposCacheEntry{}
	releasesCache  = map[string]*releasesCacheEntry{}
	cacheMu        sync.RWMutex
	reposTTL       = 5 * time.Minute
	releasesTTL    = 30 * time.Minute
)

func fetchGitHubRepos(ctx context.Context, token, username string) ([]GitHubRepo, error) {
	// Check cache
	cacheMu.RLock()
	if entry, ok := reposCache[username]; ok && time.Since(entry.timestamp) < reposTTL {
		cacheMu.RUnlock()
		return entry.data, nil
	}
	cacheMu.RUnlock()

	// Fetch list from GitHub
	listURL := "https://api.github.com/users/" + username + "/repos?per_page=100&sort=pushed"
	type ghRepo struct {
		ID          int    `json:"id"`
		Name        string `json:"name"`
		FullName    string `json:"full_name"`
		Description *string `json:"description"`
		Language    *string `json:"language"`
		Private     bool   `json:"private"`
		Fork        bool   `json:"fork"`
		Parent      *struct {
			FullName string `json:"full_name"`
		} `json:"parent"`
		StargazersCount int    `json:"stargazers_count"`
		ForksCount      int    `json:"forks_count"`
		License         *struct {
			SPDXID string `json:"spdx_id"`
		} `json:"license"`
		PushedAt  string `json:"pushed_at"`
		UpdatedAt string `json:"updated_at"`
	}

	repos, err := doGitHubAPI[[]ghRepo](ctx, token, listURL)
	if err != nil {
		return nil, err
	}

	// Map to output type
	result := make([]GitHubRepo, 0, len(repos))
	for _, r := range repos {
		desc := ""
		if r.Description != nil {
			desc = *r.Description
		}
		lang := ""
		if r.Language != nil {
			lang = *r.Language
		}
		parentName := ""
		if r.Parent != nil {
			parentName = r.Parent.FullName
		}
		license := ""
		if r.License != nil {
			license = r.License.SPDXID
		}
		result = append(result, GitHubRepo{
			ID:              r.ID,
			Name:            r.Name,
			FullName:        r.FullName,
			Description:     desc,
			Language:        lang,
			Private:         r.Private,
			Fork:            r.Fork,
			ParentFullName:  parentName,
			StargazersCount: r.StargazersCount,
			ForksCount:      r.ForksCount,
			License:         license,
			PushedAt:        r.PushedAt,
			UpdatedAt:       r.UpdatedAt,
		})
	}

	// Cache
	cacheMu.Lock()
	reposCache[username] = &reposCacheEntry{data: result, timestamp: time.Now()}
	cacheMu.Unlock()

	return result, nil
}

func fetchGitHubReleases(ctx context.Context, token, owner, repo string, perPage int) (*GitHubReleasesResponse, error) {
	cacheKey := owner + "/" + repo
	cacheMu.RLock()
	if entry, ok := releasesCache[cacheKey]; ok && time.Since(entry.timestamp) < releasesTTL {
		cacheMu.RUnlock()
		return &entry.data, nil
	}
	cacheMu.RUnlock()

	url := "https://api.github.com/repos/" + owner + "/" + repo + "/releases?per_page=" + itoa(perPage)
	type ghRelease struct {
		TagName     string `json:"tag_name"`
		Name        string `json:"name"`
		Body        string `json:"body"`
		PublishedAt string `json:"published_at"`
		HTMLURL     string `json:"html_url"`
	}

	releases, err := doGitHubAPI[[]ghRelease](ctx, token, url)
	if err != nil {
		return nil, err
	}

	result := GitHubReleasesResponse{
		Releases: make([]GitHubRelease, 0, len(releases)),
	}
	for _, r := range releases {
		body := strings.TrimSpace(r.Body)
		// Take first line of body as summary
		if idx := strings.IndexByte(body, '\n'); idx >= 0 {
			body = body[:idx]
		}
		if len(body) > 120 {
			body = body[:120] + "..."
		}
		// Use name as title, fallback to tag_name
		title := r.Name
		if title == "" {
			title = r.TagName
		}
		result.Releases = append(result.Releases, GitHubRelease{
			TagName:     r.TagName,
			Name:        title,
			Body:        body,
			PublishedAt: r.PublishedAt,
			HTMLURL:     r.HTMLURL,
		})
		if result.LatestPublishAt == "" || r.PublishedAt > result.LatestPublishAt {
			result.LatestPublishAt = r.PublishedAt
		}
	}

	cacheMu.Lock()
	releasesCache[cacheKey] = &releasesCacheEntry{data: result, timestamp: time.Now()}
	cacheMu.Unlock()

	return &result, nil
}

func itoa(n int) string {
	if n <= 0 {
		return "10"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

func doGitHubAPI[T any](ctx context.Context, token, url string) (T, error) {
	var zero T
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return zero, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Read body for error info but don't blow up
		log.Printf("GitHub API %s returned %d", url, resp.StatusCode)
		return zero, nil
	}

	var result T
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return zero, err
	}
	return result, nil
}

// ── HTTP Handlers ──

func (s Server) handleGitHubRepos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	username := r.URL.Query().Get("username")
	if username == "" {
		username = "KuMaMon2019s"
	}

	username = strings.TrimSpace(username)
	if username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}

	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	repos, err := fetchGitHubRepos(ctx, state.Config.GitHubToken, username)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, repos)
}

func (s Server) handleGitHubReleases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Parse path: /api/github/repos/{owner}/{repo}/releases
	path := strings.TrimPrefix(r.URL.Path, "/api/github/repos/")
	path = strings.TrimSuffix(path, "/releases")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeError(w, http.StatusBadRequest, "path must be /api/github/repos/{owner}/{repo}/releases")
		return
	}

	owner := parts[0]
	repo := parts[1]

	perPage := 5
	if pp := r.URL.Query().Get("per_page"); pp != "" {
		n := 0
		for _, ch := range pp {
			if ch >= '0' && ch <= '9' {
				n = n*10 + int(ch-'0')
			}
		}
		if n > 0 && n <= 100 {
			perPage = n
		}
	}

	state, err := s.store.Load()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	releases, err := fetchGitHubReleases(ctx, state.Config.GitHubToken, owner, repo, perPage)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, releases)
}
