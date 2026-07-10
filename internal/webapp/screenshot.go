package webapp

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

// ScreenshotResult holds the extracted Discord members from the widget screenshot.
type ScreenshotResult struct {
	Members          []ScreenshotMember `json:"members"`
	ScreenshotBase64 string             `json:"screenshot_base64,omitempty"`
	Error            string             `json:"error,omitempty"`
}

// ScreenshotMember is a member extracted from the Discord widget screenshot.
type ScreenshotMember struct {
	Username string `json:"username"`
	Status   string `json:"status"`
}

// In-memory cache for Discord widget members to avoid repeated chromedp calls.
var (
	memberCache      []ScreenshotMember
	memberCacheTime  time.Time
	memberCacheTTL   = 5 * time.Minute
)

// GetCachedMembers returns cached members if fresh, otherwise calls chromedp.
func GetCachedMembers(ctx context.Context, widgetURL string) ScreenshotResult {
	if time.Since(memberCacheTime) < memberCacheTTL && len(memberCache) > 0 {
		return ScreenshotResult{Members: memberCache}
	}
	result := CaptureDiscordWidgetMembers(ctx, widgetURL)
	if len(result.Members) > 0 {
		memberCache = result.Members
		memberCacheTime = time.Now()
	}
	return result
}

// CaptureDiscordWidgetMembers opens a headless browser, navigates to the Discord
// widget URL, waits for JS to render, and extracts member names from the DOM.
func CaptureDiscordWidgetMembers(ctx context.Context, widgetURL string) ScreenshotResult {
	result := ScreenshotResult{}

	widgetURL = strings.TrimSpace(widgetURL)
	if widgetURL == "" {
		result.Error = "discord widget URL is empty"
		return result
	}
	if !strings.Contains(widgetURL, "discord.com") {
		result.Error = "invalid discord widget URL"
		return result
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("remote-debugging-port", "0"),
		chromedp.WindowSize(800, 900),
	)

	allocCtx, allocCancel := chromedp.NewExecAllocator(ctx, opts...)
	defer allocCancel()

	tabCtx, tabCancel := chromedp.NewContext(allocCtx,
		chromedp.WithLogf(func(format string, args ...interface{}) {}),
	)
	defer tabCancel()

	// 60s timeout — generous for first Chrome startup
	timeoutCtx, timeoutCancel := context.WithTimeout(tabCtx, 60*time.Second)
	defer timeoutCancel()

	var membersJSON string
	var screenshotBuf []byte

	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(widgetURL),
		// Wait for React to render the members list (data-reactid or similar).
		chromedp.WaitVisible(`#discord-widget`, chromedp.ByID),
		chromedp.Sleep(3*time.Second),
		// Extract member names from the rendered widget DOM.
		chromedp.Evaluate(`
			(() => {
				const members = [];
				const seen = new Set();
				// Filter out section headers and non-username text
				const skipWords = ['ONLINE', 'MEMBERS', 'DISCORD', 'Hangout', 'MEMBER', '3 Members Online'];
				document.querySelectorAll('strong').forEach(el => {
					const name = (el.textContent || '').trim();
					if (name && name.length > 1 && name.length < 50 &&
						!skipWords.some(w => name.toUpperCase().includes(w.toUpperCase())) &&
						!seen.has(name)) {
						seen.add(name);
						members.push({ username: name, status: 'online' });
					}
				});
				// Fallback: check any element with text content that looks like a username
				if (members.length === 0) {
					const all = document.querySelectorAll('*');
					all.forEach(el => {
						if (el.children.length === 0) {
							const text = (el.textContent || '').trim();
							if (text && text.length > 1 && text.length < 50 &&
								/^[a-zA-Z0-9_\u4e00-\u9fa5 -]+$/.test(text) &&
								!seen.has(text)) {
								// Only collect if parent is likely a member container
								const p = el.parentElement;
								if (p && (p.querySelector('img') || p.querySelector('svg') ||
									p.className.includes('member') || p.className.includes('user'))) {
									seen.add(text);
									members.push({ username: text, status: 'online' });
								}
							}
						}
					});
				}
				return JSON.stringify(members);
			})()
		`, &membersJSON),
		chromedp.CaptureScreenshot(&screenshotBuf),
	)

	if err != nil {
		result.Error = fmt.Sprintf("chromedp error: %v", err)
		return result
	}

	var members []ScreenshotMember
	if err := parseScreenshotMembers(membersJSON, &members); err != nil {
		result.Error = fmt.Sprintf("parse members: %v (raw: %s)", err, truncate(membersJSON, 200))
		return result
	}

	result.Members = filterMembers(members)
	if len(screenshotBuf) > 0 {
		result.ScreenshotBase64 = base64.StdEncoding.EncodeToString(screenshotBuf)
	}
	return result
}

func parseScreenshotMembers(jsonStr string, members *[]ScreenshotMember) error {
	jsonStr = strings.TrimSpace(jsonStr)
	if jsonStr == "" || jsonStr == "[]" {
		return nil
	}
	entries := splitJSONArray(jsonStr)
	for _, entry := range entries {
		username := extractJSONValue(entry, "username")
		status := extractJSONValue(entry, "status")
		if username != "" {
			*members = append(*members, ScreenshotMember{
				Username: username,
				Status:   statusOrDefault(status),
			})
		}
	}
	return nil
}

func splitJSONArray(s string) []string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "[") || !strings.HasSuffix(s, "]") {
		return nil
	}
	s = s[1 : len(s)-1]
	var entries []string
	depth := 0
	start := -1
	for i, c := range s {
		switch c {
		case '{':
			if depth == 0 {
				start = i
			}
			depth++
		case '}':
			depth--
			if depth == 0 && start >= 0 {
				entries = append(entries, s[start:i+1])
				start = -1
			}
		}
	}
	return entries
}

func extractJSONValue(obj, key string) string {
	search := fmt.Sprintf(`"%s":"`, key)
	idx := strings.Index(obj, search)
	if idx < 0 {
		return ""
	}
	idx += len(search)
	end := strings.IndexByte(obj[idx:], '"')
	if end < 0 {
		return ""
	}
	return obj[idx : idx+end]
}

func statusOrDefault(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "online" || s == "idle" || s == "dnd" {
		return s
	}
	return "online"
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func filterMembers(members []ScreenshotMember) []ScreenshotMember {
	skipExact := map[string]bool{
		"Members Online":   true,
		"MEMBERS ONLINE":   true,
		"members online":   true,
		"3 Members Online": true,
	}
	filtered := make([]ScreenshotMember, 0, len(members))
	for _, m := range members {
		if skipExact[strings.TrimSpace(m.Username)] {
			continue
		}
		filtered = append(filtered, m)
	}
	return filtered
}

// extractIframeSrc extracts the src URL from an iframe HTML string.
func extractIframeSrc(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "<iframe") && !strings.HasPrefix(raw, "<") {
		return raw
	}
	srcIdx := strings.Index(raw, "src=")
	if srcIdx < 0 {
		return raw
	}
	srcIdx += 4
	quote := raw[srcIdx]
	srcIdx++
	end := strings.IndexByte(raw[srcIdx:], quote)
	if end < 0 {
		return raw
	}
	return raw[srcIdx : srcIdx+end]
}
