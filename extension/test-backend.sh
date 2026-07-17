# Backend Test Cases for Chrome Extension Support
# Run after Qwen's changes to verify everything works.

# ── Test 1: CORS headers on agent-workload ──
echo "=== Test 1: CORS headers ==="
curl -s -I -X OPTIONS http://127.0.0.1:8787/api/agent-workload \
  -H "Origin: chrome-extension://abcdef" \
  -H "Access-Control-Request-Method: GET" 2>&1 | grep -i "access-control"

# ── Test 2: /auth/login returns token in JSON body ──
echo "=== Test 2: Login returns token ==="
curl -s -X POST http://127.0.0.1:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Soda","password":"test"}' 2>&1 | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    has_token='token' in d
    print(f'  has_token={has_token}')
    if has_token: print(f'  token_length={len(d[\"token\"])}')
except: print('  FAILED to parse JSON')"

# ── Test 3: Bearer token auth on protected endpoint ──
echo "=== Test 3: Bearer token auth ==="
TOKEN=$(curl -s -X POST http://127.0.0.1:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Soda","password":"test123"}' 2>&1 | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")

if [ -n "$TOKEN" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    http://127.0.0.1:8787/api/me)
  echo "  /api/me with Bearer: HTTP $HTTP_CODE (expect 200)"
else
  echo "  SKIPPED (no token returned)"
fi

# ── Test 4: GET requirement by ID ──
echo "=== Test 4: GET requirement ==="
REQ_ID="testone1783934963916117000"
PROJ_ID="testproject1783934945301657000"
curl -s "http://127.0.0.1:8787/api/projects/$PROJ_ID/requirements/$REQ_ID" 2>&1 | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  title={d.get(\"title\",\"?\")}')
print(f'  has_description={\"description\" in d}')
print(f'  has_editor_content={\"editor_content\" in d}')
print(f'  has_attachments={\"attachments\" in d}')"

# ── Test 5: Agent-workload auth protected ──
echo "=== Test 5: Agent-workload with auth ==="
if [ -n "$TOKEN" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    http://127.0.0.1:8787/api/agent-workload)
  echo "  HTTP $HTTP_CODE (expect 200)"
fi

# ── Test 6: Agent-tasks auth protected ──
echo "=== Test 6: Agent-tasks with auth ==="
if [ -n "$TOKEN" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:8787/api/agent-tasks?member=Panda")
  echo "  HTTP $HTTP_CODE (expect 200)"
fi

echo "=== ALL TESTS DONE ==="
