package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ============================================================================
// Constants
// ============================================================================

const (
	queueFile      = "/Users/soda/.hermes/data/discord_sync_queue.jsonl"
	mappingsFile   = "/Users/soda/.hermes/data/discord_sync_mappings.json"
	mcpBaseURL     = "http://localhost:8085"
	mutesoloAPIURL = "http://127.0.0.1:8787"
	guildID        = "1503733248587730996"
	everyoneID     = "1503733248587730996" // @everyone role ID == guild ID
	botID          = "1527620095545704469" // Mutesolo bot user ID
	pollInterval   = 5 * time.Second
)

var (
	sseReader   *bufio.Reader // SSE stream reader, set by startSSESession
	sseReaderMu sync.Mutex    // protects sseReader
)

// ============================================================================
// Data Structures
// ============================================================================

// QueueEvent represents a single line in queue.jsonl.
type QueueEvent struct {
	Timestamp string       `json:"timestamp"`
	Processed bool         `json:"processed"`
	Payload   EventPayload `json:"payload"`
}

// EventPayload is the inner payload of a queue event.
type EventPayload struct {
	Event            string `json:"event"`
	ProjectID        string `json:"project_id"`
	ProjectName      string `json:"project_name"`
	RequirementID    string `json:"requirement_id,omitempty"`
	RequirementTitle string `json:"requirement_title,omitempty"`
	BranchID         string `json:"branch_id,omitempty"`
	AssignedMember   string `json:"assigned_member,omitempty"`
	AssignedMemberID string `json:"assigned_member_id,omitempty"`
}

// Mappings represents the full discord_sync_mappings.json structure.
type Mappings struct {
	Projects     map[string]ProjectMapping     `json:"projects"`
	Requirements map[string]RequirementMapping `json:"requirements"`
}

// ProjectMapping stores a project's Discord category ID.
type ProjectMapping struct {
	CategoryID  string `json:"category_id"`
	ProjectName string `json:"project_name"`
}

// RequirementMapping stores a requirement's Discord channel and permission state.
type RequirementMapping struct {
	ChannelID            string `json:"channelId"`
	ProjectID            string `json:"project_id"`
	CategoryID           string `json:"category_id"`
	PermissionsSet       bool   `json:"permissions_set"`
	PermissionsError     string `json:"permissions_error,omitempty"`
	WelcomeSent          bool   `json:"welcome_sent"`
	WelcomeError         string `json:"welcome_error,omitempty"`
	AssignedMember       string `json:"assigned_member,omitempty"`
	AssignedMemberID     string `json:"assigned_member_id,omitempty"`
	MemberPermissionsSet bool   `json:"member_permissions_set,omitempty"`
	BotPermissionsSet    bool   `json:"bot_permissions_set,omitempty"`
	BotLockedOut         bool   `json:"bot_locked_out,omitempty"`
	FixRequired          string `json:"fix_required,omitempty"`
}

// ============================================================================
// JSON-RPC Structures
// ============================================================================

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      string      `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
}

type toolsCallParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      string          `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *mcpError       `json:"error,omitempty"`
}

type mcpError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// configResponse is the subset of Config we need from Mutesolo /api/config.
type configResponse struct {
	AgentSelf        string `json:"agent_self"`
	AgentSelfID      string `json:"agent_self_id"`
	DiscordWidgetURL string `json:"discord_widget_url"`
}

// widgetMember represents a member from Discord Widget API.
type widgetMember struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

// widgetResponse is the Discord Widget API JSON response.
type widgetResponse struct {
	Members []widgetMember `json:"members"`
}

// ============================================================================
// Global State
// ============================================================================

var (
	mappings   *Mappings
	mappingsMu sync.Mutex
	selfUserID string // cached self Discord user ID (from agent_self config)
)

// ============================================================================
// Main Entry Point
// ============================================================================

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Println("sync-discord starting...")
	log.Printf("Queue file: %s", queueFile)
	log.Printf("Mappings file: %s", mappingsFile)
	log.Printf("MCP base URL: %s", mcpBaseURL)
	log.Printf("Poll interval: %v", pollInterval)

	// Load initial mappings.
	loadMappings()

	// Resolve self Discord user ID from agent_self config.
	loadSelfDiscordID()

	// Main loop.
	for {
		processQueue()
		time.Sleep(pollInterval)
	}
}

// ============================================================================
// Queue Processing
// ============================================================================

func processQueue() {
	events, err := readQueue()
	if err != nil {
		log.Printf("ERROR reading queue: %v", err)
		return
	}

	unprocessed := findUnprocessed(events)
	if len(unprocessed) == 0 {
		return
	}

	log.Printf("Found %d unprocessed event(s)", len(unprocessed))

	// Start a fresh SSE session for this batch.
	sessionID, err := startSSESession()
	if err != nil {
		log.Printf("ERROR starting SSE session: %v", err)
		return
	}
	defer closeSSESession(sessionID) // best-effort

	log.Printf("SSE session established: %s", sessionID)

	// Process each event in the same session.
	for _, ev := range unprocessed {
		processEvent(ev, sessionID)
	}

	// Persist updated mappings.
	saveMappings()
}

func findUnprocessed(events []QueueEvent) []QueueEvent {
	var result []QueueEvent
	for _, ev := range events {
		if !ev.Processed && ev.Payload.Event != "test" {
			result = append(result, ev)
		}
	}
	return result
}

func processEvent(ev QueueEvent, sessionID string) {
	payload := ev.Payload
	log.Printf("Processing event: type=%s project=%s requirement=%s",
		payload.Event, payload.ProjectName, payload.RequirementID)

	switch payload.Event {
	case "requirement_created":
		handleRequirementCreated(payload, sessionID, ev)
	default:
		log.Printf("Unknown event type: %s — marking processed", payload.Event)
		markProcessed(ev)
	}
}

// ============================================================================
// Core Logic: handle requirement_created
// ============================================================================

func handleRequirementCreated(payload EventPayload, sessionID string, ev QueueEvent) {
	reqID := payload.RequirementID
	projID := payload.ProjectID

	// --- Dedup: skip if already in mappings ---
	mappingsMu.Lock()
	if _, exists := mappings.Requirements[reqID]; exists {
		mappingsMu.Unlock()
		log.Printf("SKIP: requirement %s already in mappings", reqID)
		markProcessed(ev)
		return
	}
	mappingsMu.Unlock()

	// --- Step 1: Find or create category ---
	catID, err := findOrCreateCategory(payload.ProjectName, projID, sessionID)
	if err != nil {
		log.Printf("ERROR creating category for project %s: %v", payload.ProjectName, err)
		markProcessed(ev)
		return
	}
	log.Printf("Category ready: %s", catID)

	// --- Step 2: Create text channel ---
	chID, err := createTextChannel(payload.RequirementTitle, catID, sessionID)
	if err != nil {
		log.Printf("ERROR creating channel '%s': %v", payload.RequirementTitle, err)
		markProcessed(ev)
		return
	}
	log.Printf("Channel created: %s", chID)

	// Save mapping early so we don't lose the channel ID on later failures.
	mapping := RequirementMapping{
		ChannelID:        chID,
		ProjectID:        projID,
		CategoryID:       catID,
		AssignedMember:   payload.AssignedMember,
		AssignedMemberID: payload.AssignedMemberID,
	}
	mappingsMu.Lock()
	mappings.Requirements[reqID] = mapping
	mappingsMu.Unlock()

	// --- Step 3: ALLOW bot FIRST (before locking) ---
	// Bot cannot set permissions on itself after @everyone is denied.
	botPermsOK := false
	if err := upsertMemberPerms(chID, botID, "view_channel,send_messages,read_message_history", sessionID); err != nil {
		log.Printf("WARNING: bot permissions failed for %s: %v", chID, err)
	} else {
		botPermsOK = true
		log.Printf("Bot permissions granted for %s", chID)
	}

	// --- Step 4: ALLOW assigned agent (before locking) ---
	memberPermsOK := false
	if payload.AssignedMemberID != "" {
		perms := "view_channel,send_messages,read_message_history"
		if err := upsertMemberPerms(chID, payload.AssignedMemberID, perms, sessionID); err != nil {
			log.Printf("WARNING: member permissions failed for %s (member=%s): %v",
				chID, payload.AssignedMemberID, err)
		} else {
			memberPermsOK = true
			log.Printf("Member permissions granted for %s (member=%s)", chID, payload.AssignedMemberID)
		}
	}

	// --- Step 5: ALLOW self (before locking) ---
	selfPermsOK := false
	if selfUserID != "" {
		if selfUserID == payload.AssignedMemberID {
			selfPermsOK = memberPermsOK
		} else {
			if err := upsertMemberPerms(chID, selfUserID, "view_channel,send_messages,read_message_history", sessionID); err != nil {
				log.Printf("WARNING: self permissions failed for %s: %v", chID, err)
			} else {
				selfPermsOK = true
				log.Printf("Self permissions granted for %s (self=%s)", chID, selfUserID)
			}
		}
	}

	// --- Step 6: Send welcome message (before locking) ---
	welcomeSent := false
	if err := sendWelcomeMessage(chID, payload, sessionID); err != nil {
		log.Printf("WARNING: welcome message failed for %s: %v", chID, err)
		mappingsMu.Lock()
		m := mappings.Requirements[reqID]
		m.WelcomeError = err.Error()
		mappings.Requirements[reqID] = m
		mappingsMu.Unlock()
	} else {
		welcomeSent = true
		log.Printf("Welcome message sent to %s", chID)
	}

	// --- Step 7: DENY @everyone LAST — lock the door ---
	// Everything above was done while the channel is still visible.
	// Bot/member/self permissions are already set, so they retain access.
	mappingsMu.Lock()
	m := mappings.Requirements[reqID]
	if botPermsOK {
		m.BotPermissionsSet = true
	}
	if memberPermsOK {
		m.MemberPermissionsSet = true
	}
	m.PermissionsSet = true
	m.WelcomeSent = welcomeSent
	mappings.Requirements[reqID] = m
	mappingsMu.Unlock()

	everyoneDenied := false
	if err := upsertRolePerms(chID, everyoneID, "", "view_channel", sessionID); err != nil {
		log.Printf("WARNING: @everyone deny failed for %s: %v", chID, err)
		mappingsMu.Lock()
		m := mappings.Requirements[reqID]
		m.PermissionsError = err.Error()
		mappings.Requirements[reqID] = m
		mappingsMu.Unlock()
	} else {
		everyoneDenied = true
		log.Printf("@everyone denied for %s — channel is now private", chID)
	}

	log.Printf("DONE: requirement %s → channel %s (welcome=%v, member=%v, bot=%v, self=%v, private=%v)",
		reqID, chID, welcomeSent, memberPermsOK, botPermsOK, selfPermsOK, everyoneDenied)

	// --- Mark event processed ---
	markProcessed(ev)
}

// ============================================================================
// MCP HTTP API Calls
// ============================================================================

// startSSESession connects to the MCP SSE endpoint and extracts the session ID.
func startSSESession() (string, error) {
	resp, err := http.Get(mcpBaseURL + "/mcp/sse")
	if err != nil {
		return "", fmt.Errorf("SSE connect: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return "", fmt.Errorf("SSE returned status %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)

	// Read lines until we find the endpoint event with sessionId.
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			resp.Body.Close()
			return "", fmt.Errorf("reading SSE stream: %w", err)
		}

		line = strings.TrimRight(line, "\r\n")

		// Empty line = event boundary; skip.
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "event:") {
			eventType := strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			if eventType == "endpoint" {
				// Next data line contains the endpoint URL.
				dataLine, err := reader.ReadString('\n')
				if err != nil {
					resp.Body.Close()
					return "", fmt.Errorf("reading SSE data: %w", err)
				}
				dataLine = strings.TrimRight(dataLine, "\r\n")

				if strings.HasPrefix(dataLine, "data: ") {
					data := strings.TrimPrefix(dataLine, "data: ")
					// data looks like "/mcp/message?sessionId=xxx"
					sessionID := extractSessionID(data)
					if sessionID == "" {
						resp.Body.Close()
						return "", fmt.Errorf("could not extract sessionId from: %s", data)
					}
					// NOTE: we intentionally do NOT close resp.Body — the SSE
								// connection must stay open for the session to remain valid.
								sseReaderMu.Lock()
								sseReader = reader
								sseReaderMu.Unlock()
								return sessionID, nil
				}
			}
		}
	}
}

// extractSessionID pulls the sessionId query param from an endpoint URL.
func extractSessionID(url string) string {
	// Expected: "/mcp/message?sessionId=abc123" or full URL with same pattern.
	idx := strings.Index(url, "sessionId=")
	if idx < 0 {
		return ""
	}
	start := idx + len("sessionId=")
	end := strings.IndexAny(url[start:], "& \t\n\r")
	if end < 0 {
		return url[start:]
	}
	return url[start : start+end]
}

// closeSSESession is a best-effort cleanup. In practice, the SSE connection
// stays alive for the lifetime of the process (reused across polls).
func closeSSESession(sessionID string) {
	// No-op: SSE is long-lived. We keep the connection open.
	_ = sessionID
}

// loadSelfDiscordID fetches the agent_self name from Mutesolo config and resolves
// it to a Discord user ID. Strategy:
//  1. If agent_self matches the bot username (from config), use botID.
//  2. Otherwise, scan existing mappings for a matching assigned_member name.
//     (The webapp stores real Discord snowflakes in assigned_member_id.)
// Result is cached in selfUserID.
func loadSelfDiscordID() {
	// Fetch config from Mutesolo API.
	cfg, err := fetchMutesoloConfig()
	if err != nil {
		log.Printf("WARNING: cannot fetch Mutesolo config: %v — self permissions will be skipped", err)
		return
	}

	agentSelf := strings.TrimSpace(cfg.AgentSelf)
	if agentSelf == "" {
		log.Println("agent_self not configured — self permissions will be skipped")
		return
	}

	log.Printf("agent_self configured as: %s", agentSelf)

	// Priority 1: Use AgentSelfID from config if available.
	if cfg.AgentSelfID != "" {
		selfUserID = cfg.AgentSelfID
		log.Printf("Self Discord ID from config: %s → %s", agentSelf, selfUserID)
		return
	}

	// Fallback: Try to find self ID from existing mappings (assigned_member_id).
	mappingsMu.Lock()
	for _, rm := range mappings.Requirements {
		if rm.AssignedMemberID != "" && strings.EqualFold(rm.AssignedMember, agentSelf) {
			selfUserID = rm.AssignedMemberID
			log.Printf("Self Discord ID found in mappings: %s → %s", agentSelf, selfUserID)
			mappingsMu.Unlock()
			return
		}
	}
	mappingsMu.Unlock()

	log.Printf("WARNING: cannot resolve self Discord ID for '%s' — self permissions will be skipped", agentSelf)
}

// fetchMutesoloConfig calls GET /api/config on the Mutesolo server.
func fetchMutesoloConfig() (*configResponse, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(mutesoloAPIURL + "/api/config")
	if err != nil {
		return nil, fmt.Errorf("GET /api/config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("/api/config returned status %d", resp.StatusCode)
	}

	var cfg configResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	return &cfg, nil
}

// extractWidgetURL extracts the real Discord widget URL from an iframe embed string,
// and converts widget iframe URLs to the JSON API format.
func extractWidgetURL(raw string) string {
	raw = strings.TrimSpace(raw)
	// If it's an iframe embed, extract the src attribute.
	if strings.HasPrefix(raw, "<iframe") || strings.HasPrefix(raw, "<") {
		srcIdx := strings.Index(raw, "src=")
		if srcIdx >= 0 {
			srcIdx += 4
			quote := raw[srcIdx]
			srcIdx++
			end := strings.IndexByte(raw[srcIdx:], quote)
			if end >= 0 {
				raw = raw[srcIdx : srcIdx+end]
			}
		}
	}
	// Convert widget iframe URL to API endpoint:
	// https://discord.com/widget?id=GUILD&theme=dark → https://discord.com/api/guilds/GUILD/widget.json
	if strings.Contains(raw, "/widget?") || strings.Contains(raw, "/widget?id=") {
		guildIdx := strings.Index(raw, "id=")
		if guildIdx >= 0 {
			guildIdx += 3
			end := strings.IndexAny(raw[guildIdx:], "& \t\n\r")
			if end < 0 {
				end = len(raw[guildIdx:])
			}
			guildID := raw[guildIdx : guildIdx+end]
			return fmt.Sprintf("https://discord.com/api/guilds/%s/widget.json", guildID)
		}
	}
	return raw
}

// resolveDiscordUserID resolves a Discord username to a user ID using the Widget API.
func resolveDiscordUserID(widgetURL, username string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(widgetURL)
	if err != nil {
		return "", fmt.Errorf("widget API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("widget API returned status %d", resp.StatusCode)
	}

	var w widgetResponse
	if err := json.NewDecoder(resp.Body).Decode(&w); err != nil {
		return "", fmt.Errorf("decode widget response: %w", err)
	}

	for _, m := range w.Members {
		if strings.EqualFold(m.Username, username) {
			return m.ID, nil
		}
	}

	return "", fmt.Errorf("member '%s' not found in widget (checked %d members)", username, len(w.Members))
}

// callMCP sends a JSON-RPC call to a specific MCP tool and returns the result text.
func callMCP(sessionID, toolName string, args map[string]interface{}) (string, error) {
	params := toolsCallParams{
		Name:      toolName,
		Arguments: args,
	}

	reqBody := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      "1",
		Method:  "tools/call",
		Params:  params,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/mcp/message?sessionId=%s", mcpBaseURL, sessionID)
	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBytes))
	if err != nil {
		return "", fmt.Errorf("POST %s: %w", url, err)
	}
	resp.Body.Close() // response is empty for SSE transport

	// Read the result from the SSE stream (NOT from the HTTP response).
	sseReaderMu.Lock()
	reader := sseReader
	sseReaderMu.Unlock()
	if reader == nil {
		return "", fmt.Errorf("SSE reader not available")
	}

	return readSSEEvent(reader)
}

// readSSEEvent reads one SSE event from the reader and parses the JSON-RPC result.
func readSSEEvent(reader *bufio.Reader) (string, error) {
	var dataLines []string
	inMessageEvent := false

	for {
		line, err := reader.ReadString('\n')
		trimmed := strings.TrimRight(line, "\r\n")

		if strings.HasPrefix(trimmed, "event: ") {
			eventType := strings.TrimPrefix(trimmed, "event: ")
			inMessageEvent = (eventType == "message")
			// Reset data lines when entering a new event
			if inMessageEvent {
				dataLines = nil
			}
			if err != nil {
				break
			}
			continue
		}

		if inMessageEvent && strings.HasPrefix(trimmed, "data: ") {
			dataLines = append(dataLines, strings.TrimPrefix(trimmed, "data: "))
		}

		// Empty line = event boundary
		if trimmed == "" {
			if inMessageEvent && len(dataLines) > 0 {
				break
			}
			inMessageEvent = false
		}

		if err != nil {
			if len(dataLines) > 0 {
				break
			}
			return "", fmt.Errorf("SSE read error: %w", err)
		}
	}

	if len(dataLines) == 0 {
		return "", fmt.Errorf("no SSE data found")
	}

	dataStr := strings.Join(dataLines, "")
	var rpcResp mcpResponse
	if err := json.Unmarshal([]byte(dataStr), &rpcResp); err != nil {
		return dataStr, nil
	}

	if rpcResp.Error != nil {
		return "", fmt.Errorf("MCP error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	var resultText struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if json.Unmarshal(rpcResp.Result, &resultText) == nil && len(resultText.Content) > 0 {
		return resultText.Content[0].Text, nil
	}
	return string(rpcResp.Result), nil
}

// ============================================================================
// MCP Tool Wrappers
// ============================================================================

// findOrCreateCategory looks up an existing category for the project or creates one.
func findOrCreateCategory(projectName, projectID, sessionID string) (string, error) {
	// Check mappings first.
	mappingsMu.Lock()
	if pm, ok := mappings.Projects[projectID]; ok && pm.CategoryID != "" {
		mappingsMu.Unlock()
		log.Printf("Category found in cache: %s → %s", projectName, pm.CategoryID)
		return pm.CategoryID, nil
	}
	mappingsMu.Unlock()

	// Try to find existing category by name.
	result, err := callMCP(sessionID, "find_category", map[string]interface{}{
		"guildId": guildID,
		"name":     projectName,
	})
	if err != nil {
		log.Printf("find_category failed: %v — will try create_category", err)
	} else {
		catID := extractID(result)
		if catID != "" {
			mappingsMu.Lock()
			mappings.Projects[projectID] = ProjectMapping{
				CategoryID:  catID,
				ProjectName: projectName,
			}
			mappingsMu.Unlock()
			log.Printf("Found existing category: %s → %s", projectName, catID)
			return catID, nil
		}
	}

	// Create new category.
	result, err = callMCP(sessionID, "create_category", map[string]interface{}{
		"guildId": guildID,
		"name":     projectName,
	})
	if err != nil {
		return "", fmt.Errorf("create_category: %w", err)
	}

	catID := extractID(result)
	if catID == "" {
		return "", fmt.Errorf("create_category returned no ID: %s", result)
	}

	mappingsMu.Lock()
	mappings.Projects[projectID] = ProjectMapping{
		CategoryID:  catID,
		ProjectName: projectName,
	}
	mappingsMu.Unlock()

	log.Printf("Created category: %s → %s", projectName, catID)
	return catID, nil
}

// createTextChannel creates a text channel in the given category.
// Channel name is lowercased and truncated to 100 characters (Discord limit).
func createTextChannel(name, categoryID, sessionID string) (string, error) {
	// Normalize: lowercase, replace spaces with hyphens, truncate to 100 chars.
	normalized := strings.ToLower(name)
	normalized = strings.ReplaceAll(normalized, " ", "-")
	// Remove characters Discord doesn't allow in channel names.
	normalized = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, normalized)
	if len(normalized) > 100 {
		normalized = normalized[:100]
	}
	// Trim leading/trailing hyphens.
	normalized = strings.Trim(normalized, "-")
	if normalized == "" {
		normalized = "channel"
	}

	result, err := callMCP(sessionID, "create_text_channel", map[string]interface{}{
		"guildId":    guildID,
		"name":       normalized,
		"categoryId": categoryID,
	})
	if err != nil {
		return "", fmt.Errorf("create_text_channel: %w", err)
	}

	chID := extractID(result)
	if chID == "" {
		return "", fmt.Errorf("create_text_channel returned no ID: %s", result)
	}
	return chID, nil
}

// sendWelcomeMessage sends the initial welcome message to the new channel.
func sendWelcomeMessage(channelID string, payload EventPayload, sessionID string) error {
	msg := fmt.Sprintf(
		"📋 **Requirement Created: %s**\n"+
			"**Project:** %s\n"+
			"**Assigned to:** %s\n\n"+
			"This channel has been created for discussion and tracking of this requirement.",
		payload.RequirementTitle,
		payload.ProjectName,
		coalesce(payload.AssignedMember, "Unassigned"),
	)

	// If a member is assigned, @mention them so they get a ping notification
	// and can click through to discover this private channel.
	if payload.AssignedMemberID != "" {
		msg += fmt.Sprintf("\n\n<@%s> You are assigned to this task.", payload.AssignedMemberID)
	}

	_, err := callMCP(sessionID, "send_message", map[string]interface{}{
		"channelId": channelID,
		"content":    msg,
	})
	return err
}

// upsertMemberPerms grants/updates permissions for a specific member.
func upsertMemberPerms(channelID, userID, allow, sessionID string) error {
	args := map[string]interface{}{
		"channelId": channelID,
		"userId":    userID,
	}
	if allow != "" {
		args["allowPermissions"] = allow
	}

	_, err := callMCP(sessionID, "upsert_member_channel_permissions", args)
	return err
}

// upsertRolePerms sets role-based permissions (used for deny @everyone).
func upsertRolePerms(channelID, roleID, allow, deny, sessionID string) error {
	args := map[string]interface{}{
		"channelId": channelID,
		"roleId":    roleID,
	}
	if allow != "" {
		args["allowPermissions"] = allow
	}
	if deny != "" {
		args["denyPermissions"] = deny
	}

	_, err := callMCP(sessionID, "upsert_role_channel_permissions", args)
	return err
}

// ============================================================================
// Queue File I/O
// ============================================================================

// readQueue reads all lines from queue.jsonl and parses them.
func readQueue() ([]QueueEvent, error) {
	f, err := os.Open(queueFile)
	if err != nil {
		return nil, fmt.Errorf("open queue file: %w", err)
	}
	defer f.Close()

	var events []QueueEvent
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var ev QueueEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			log.Printf("WARNING: skipping malformed queue line: %v", err)
			continue
		}
		events = append(events, ev)
	}
	return events, scanner.Err()
}

// markProcessed rewrites queue.jsonl with the given event marked processed=true.
// This is a full-file rewrite for simplicity; for high-throughput, consider
// an append-only write-ahead log.
func markProcessed(ev QueueEvent) {
	events, err := readQueue()
	if err != nil {
		log.Printf("ERROR re-reading queue for mark: %v", err)
		return
	}

	// Match by timestamp + requirement_id (best-effort unique key).
	// We linear-scan because the queue is small.
	matched := false
	for i := range events {
		if !events[i].Processed &&
			events[i].Timestamp == ev.Timestamp &&
			events[i].Payload.RequirementID == ev.Payload.RequirementID {
			events[i].Processed = true
			matched = true
			break
		}
	}

	if !matched {
		log.Printf("WARNING: could not find event to mark processed: %s/%s",
			ev.Timestamp, ev.Payload.RequirementID)
		return
	}

	writeQueue(events)
}

// writeQueue writes all queue events back to the file.
func writeQueue(events []QueueEvent) {
	f, err := os.Create(queueFile)
	if err != nil {
		log.Printf("ERROR writing queue file: %v", err)
		return
	}
	defer f.Close()

	for _, ev := range events {
		b, _ := json.Marshal(ev)
		f.Write(b)
		f.Write([]byte("\n"))
	}
}

// ============================================================================
// Mappings File I/O
// ============================================================================

// loadMappings reads the mappings file into memory.
func loadMappings() {
	mappingsMu.Lock()
	defer mappingsMu.Unlock()

	mappings = &Mappings{
		Projects:     make(map[string]ProjectMapping),
		Requirements: make(map[string]RequirementMapping),
	}

	data, err := os.ReadFile(mappingsFile)
	if err != nil {
		if os.IsNotExist(err) {
			log.Println("Mappings file not found — starting fresh")
			return
		}
		log.Printf("ERROR reading mappings file: %v", err)
		return
	}

	if err := json.Unmarshal(data, mappings); err != nil {
		log.Printf("ERROR parsing mappings file: %v", err)
	}
	log.Printf("Loaded mappings: %d projects, %d requirements",
		len(mappings.Projects), len(mappings.Requirements))
}

// saveMappings writes the current mappings to disk.
func saveMappings() {
	mappingsMu.Lock()
	defer mappingsMu.Unlock()

	data, err := json.MarshalIndent(mappings, "", "  ")
	if err != nil {
		log.Printf("ERROR marshalling mappings: %v", err)
		return
	}

	if err := os.WriteFile(mappingsFile, data, 0644); err != nil {
		log.Printf("ERROR writing mappings file: %v", err)
	}
}

// ============================================================================
// Helpers
// ============================================================================

// extractID tries to extract a Discord snowflake ID from MCP result text.
// Searches for a 17-20 digit number in the response.
func extractID(result string) string {
	result = strings.TrimSpace(result)
	// If the result is just a number, return it directly.
	if len(result) >= 17 && len(result) <= 20 && isDigits(result) {
		return result
	}
	// Try to find a quoted ID in JSON or free text.
	words := strings.Fields(result)
	for _, w := range words {
		w = strings.Trim(w, `"'[],{}()`) 
		if len(w) >= 17 && len(w) <= 20 && isDigits(w) {
			return w
		}
	}
	// Fallback: return the whole result (caller can decide).
	return ""
}

func isDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func coalesce(a, fallback string) string {
	if a != "" {
		return a
	}
	return fallback
}
