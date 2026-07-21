package webapp

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

// DiscordSyncWebhookURL returns the webhook endpoint for Discord sync notifications.
// Defaults to http://localhost:9999/webhook; override with DISCORD_SYNC_WEBHOOK_URL env var.
func DiscordSyncWebhookURL() string {
	if u := os.Getenv("DISCORD_SYNC_WEBHOOK_URL"); u != "" {
		return u
	}
	return "http://localhost:9999/webhook"
}

// SyncProjectCreated sends a project_created event to the Discord sync webhook.
// Caller should invoke this as a goroutine to avoid blocking the API response.
func SyncProjectCreated(project Project) {
	payload := map[string]string{
		"event":        "project_created",
		"project_id":   project.ID,
		"project_name": project.Name,
	}
	sendWebhook(payload)
}

// SyncRequirementCreated sends a requirement_created event to the Discord sync webhook.
// Caller should invoke this as a goroutine to avoid blocking the API response.
func SyncRequirementCreated(projectID, projectName string, req Requirement) {
	payload := map[string]string{
		"event":              "requirement_created",
		"project_id":         projectID,
		"project_name":       projectName,
		"requirement_id":     req.ID,
		"requirement_title":  req.Title,
		"branch_id":          req.BranchID,
		"assigned_member":    req.AssignedMember,
		"assigned_member_id": req.AssignedMemberID,
	}
	sendWebhook(payload)
}

func sendWebhook(payload map[string]string) {
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("discord_sync: marshal payload: %v", err)
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(DiscordSyncWebhookURL(), "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("discord_sync: POST %s: %v", DiscordSyncWebhookURL(), err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("discord_sync: POST %s returned %d", DiscordSyncWebhookURL(), resp.StatusCode)
	}
}
