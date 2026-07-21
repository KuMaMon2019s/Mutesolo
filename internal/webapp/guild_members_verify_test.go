package webapp

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type verifyMockRepo struct{}

func (m verifyMockRepo) Load() (State, error) {
	return State{
		Config: Config{
			DiscordBotToken: "test-bot-token",
			DiscordGuildID:  "123456789",
		},
	}, nil
}
func (m verifyMockRepo) Save(State) error                  { return nil }
func (m verifyMockRepo) LoadMembers() ([]Member, error)    { return nil, nil }
func (m verifyMockRepo) SaveMembers([]Member) error        { return nil }
func (m verifyMockRepo) RebuildStats(State) error          { return nil }
func (m verifyMockRepo) LoadStats(_, _ string) (StatsResponse, error) { return StatsResponse{}, nil }

func TestGuildMembersEndpointExists(t *testing.T) {
	s := NewServer(verifyMockRepo{}, "web", nil)
	h := s.Handler()

	req := httptest.NewRequest("GET", "/api/discord/guild-members", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]json.RawMessage
	json.NewDecoder(w.Body).Decode(&body)
	if _, ok := body["members"]; !ok {
		t.Fatal("response missing 'members' key")
	}
	t.Logf("GET /api/discord/guild-members OK")
}

func TestGuildMembersEndpointRejectsPOST(t *testing.T) {
	s := NewServer(verifyMockRepo{}, "web", nil)
	h := s.Handler()

	req := httptest.NewRequest("POST", "/api/discord/guild-members", strings.NewReader("{}"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != 405 {
		t.Fatalf("POST should return 405, got %d", w.Code)
	}
}

func TestConfigMergeDiscordBotToken(t *testing.T) {
	s := NewServer(verifyMockRepo{}, "web", nil)
	h := s.Handler()

	body, _ := json.Marshal(map[string]string{"discord_bot_token": "abc123"})
	req := httptest.NewRequest("PUT", "/api/config", strings.NewReader(string(body)))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("PUT /api/config returned %d: %s", w.Code, w.Body.String())
	}
}
