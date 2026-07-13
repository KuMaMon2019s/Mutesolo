package webapp

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// JWT secret — generated once at startup. All sessions are invalidated on restart.
var jwtSecret []byte

func init() {
	jwtSecret = make([]byte, 32)
	if _, err := rand.Read(jwtSecret); err != nil {
		jwtSecret = []byte("mutesolo-fallback-jwt-secret-32ch")
	}
}

// ---------------------------------------------------------------------------
// Simple username/password auth
// ---------------------------------------------------------------------------

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// handleAuthLogin: POST username + password → verify → JWT cookie
func (s Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	ss, ok := s.store.(*SQLiteStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "auth requires sqlite backend")
		return
	}

	user, err := ss.GetUserByUsername(req.Username)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	jwt, err := generateJWT(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "generate jwt failed: "+err.Error())
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "mutesolo_token",
		Value:    jwt,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 3600,
	})
	writeJSON(w, user)
}

// handleAuthRegister: POST username + password → create user → JWT cookie
func (s Server) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" || len(req.Password) < 4 {
		writeError(w, http.StatusBadRequest, "username required, password at least 4 chars")
		return
	}

	ss, ok := s.store.(*SQLiteStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "auth requires sqlite backend")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "hash password failed")
		return
	}

	user, err := ss.CreateUser(req.Username, string(hash))
	if err != nil {
		writeError(w, http.StatusConflict, "username already exists")
		return
	}

	jwt, err := generateJWT(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "generate jwt failed: "+err.Error())
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "mutesolo_token",
		Value:    jwt,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 3600,
	})
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, user)
}

// handleAuthLogout clears the auth cookie.
func (s Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "mutesolo_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

// handleChangePassword updates the user's password.
func (s Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.NewPassword) < 4 {
		writeError(w, http.StatusBadRequest, "new password must be at least 4 characters")
		return
	}

	ss, ok := s.store.(*SQLiteStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "auth requires sqlite backend")
		return
	}
	fullUser, err := ss.GetUserByID(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user lookup failed")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(fullUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "hash password failed")
		return
	}
	if err := ss.UpdatePassword(user.ID, string(hash)); err != nil {
		writeError(w, http.StatusInternalServerError, "update password failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleMe returns the currently authenticated user (or 401).
func (s Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, user)
}

// ---------------------------------------------------------------------------
// JWT (HMAC-SHA256)
// ---------------------------------------------------------------------------

type jwtClaims struct {
	Sub int64 `json:"sub"`
	Exp int64 `json:"exp"`
}

func generateJWT(userID int64) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims := jwtClaims{Sub: userID, Exp: time.Now().Add(30 * 24 * time.Hour).Unix()}
	claimsJSON, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(claimsJSON)
	sigInput := header + "." + payload
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(sigInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return sigInput + "." + sig, nil
}

func parseJWT(tokenStr string) (int64, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return 0, fmt.Errorf("invalid jwt format")
	}
	sigInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(sigInput))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if parts[2] != expectedSig {
		return 0, fmt.Errorf("invalid jwt signature")
	}
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return 0, fmt.Errorf("decode jwt payload: %w", err)
	}
	var claims jwtClaims
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return 0, fmt.Errorf("parse jwt claims: %w", err)
	}
	if time.Now().Unix() > claims.Exp {
		return 0, fmt.Errorf("jwt expired")
	}
	return claims.Sub, nil
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

type contextKey string

const userContextKey contextKey = "mutesolo-user"

func UserFromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(userContextKey).(*User)
	return u, ok && u != nil
}

func RequireUser(store *SQLiteStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("mutesolo_token")
			if err != nil || cookie.Value == "" {
				writeError(w, http.StatusUnauthorized, "not authenticated")
				return
			}
			userID, err := parseJWT(cookie.Value)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "invalid or expired session")
				return
			}
			user, err := store.GetUserByID(userID)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "user not found")
				return
			}
			ctx := context.WithValue(r.Context(), userContextKey, &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
