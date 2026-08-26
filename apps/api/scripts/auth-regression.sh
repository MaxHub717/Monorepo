#!/usr/bin/env bash

set -u

BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"

PLAYER_EMAIL="${PLAYER_EMAIL:-akpabiomartin@gmail.com}"
PLAYER_PASSWORD="${PLAYER_PASSWORD:-}"

ADMIN_EMAIL="${ADMIN_EMAIL:-hq-admin@nexgen.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

DATABASE_URL="${DATABASE_URL:-}"

PLAYER_COOKIE="$(mktemp)"
PLAYER2_COOKIE="$(mktemp)"
ADMIN_COOKIE="$(mktemp)"
EXPIRED_COOKIE="$(mktemp)"
CONCURRENT_COOKIE="$(mktemp)"

cleanup() {
  rm -f \
    "$PLAYER_COOKIE" \
    "$PLAYER2_COOKIE" \
    "$ADMIN_COOKIE" \
    "$EXPIRED_COOKIE" \
    "$CONCURRENT_COOKIE"
}

trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '  \033[32mPASS\033[0m %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '  \033[31mFAIL\033[0m %s\n' "$1"
}

section() {
  printf '\n\033[1;36m%s\033[0m\n' "$1"
}

require_value() {
  local name="$1"
  local value="$2"

  if [ -z "$value" ]; then
    echo "ERROR: $name is not set."
    exit 1
  fi
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local description="$3"

  if [ "$actual" = "$expected" ]; then
    pass "$description"
    return 0
  fi

  fail "$description — expected HTTP $expected, got HTTP $actual"
  return 1
}

assert_success() {
  local body="$1"
  local description="$2"

  if echo "$body" | grep -q '"success"\:true'; then
    pass "$description"
    return 0
  fi

  fail "$description"
  echo "    Response: $body"
  return 1
}

assert_body_contains() {
  local body="$1"
  local expected="$2"
  local description="$3"

  if echo "$body" | grep -q "$expected"; then
    pass "$description"
    return 0
  fi

  fail "$description"
  echo "    Response: $body"
  return 1
}

extract_refresh_token() {
  local cookie_file="$1"

  awk '$6 == "refreshToken" {print $7}' "$cookie_file" | tail -n 1
}

extract_access_token() {
  local cookie_file="$1"

  awk '$6 == "accessToken" {print $7}' "$cookie_file" | tail -n 1
}

login_player() {
  local cookie_file="$1"
  local output_file="$2"

  curl -sS \
    -o "$output_file" \
    -w '%{http_code}' \
    -c "$cookie_file" \
    -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{
      \"email\": \"$PLAYER_EMAIL\",
      \"password\": \"$PLAYER_PASSWORD\"
    }"
}

login_admin() {
  local cookie_file="$1"
  local output_file="$2"

  curl -sS \
    -o "$output_file" \
    -w '%{http_code}' \
    -c "$cookie_file" \
    -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{
      \"email\": \"$ADMIN_EMAIL\",
      \"password\": \"$ADMIN_PASSWORD\"
    }"
}

echo
echo "=============================================="
echo " NexGen Esport Authentication/Authorization"
echo " Regression Test"
echo "=============================================="
echo
echo "Base URL: $BASE_URL"

require_value "PLAYER_PASSWORD" "$PLAYER_PASSWORD"
require_value "ADMIN_PASSWORD" "$ADMIN_PASSWORD"
require_value "DATABASE_URL" "$DATABASE_URL"

# ============================================================
# AUTHENTICATION
# ============================================================

section "Authentication"

echo
echo "1. Player login"

LOGIN_RESPONSE="$(
  login_player \
    "$PLAYER_COOKIE" \
    /tmp/nexgen-player-login-response.json
)"

LOGIN_BODY="$(cat /tmp/nexgen-player-login-response.json)"

if assert_status "201" "$LOGIN_RESPONSE" "Player login returns 201"; then
  assert_success "$LOGIN_BODY" "Player login succeeds"
fi

if grep -q 'accessToken' "$PLAYER_COOKIE" &&
   grep -q 'refreshToken' "$PLAYER_COOKIE"; then
  pass "Player accessToken and refreshToken cookies created"
else
  fail "Player authentication cookies were not created"
fi

echo
echo "2. /users/me"

ME_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-player-me.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    "$BASE_URL/users/me"
)"

ME_BODY="$(cat /tmp/nexgen-player-me.json)"

if assert_status "200" "$ME_RESPONSE" "Player /users/me returns 200"; then
  assert_success "$ME_BODY" "Player /users/me succeeds"
fi

echo
echo "3. Refresh"

cp "$PLAYER_COOKIE" /tmp/nexgen-player-before-refresh.cookies

REFRESH_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-player-refresh.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -c "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

REFRESH_BODY="$(cat /tmp/nexgen-player-refresh.json)"

if assert_status "201" "$REFRESH_RESPONSE" "Refresh returns 201"; then
  assert_success "$REFRESH_BODY" "Refresh succeeds"
fi

if cmp -s \
  /tmp/nexgen-player-before-refresh.cookies \
  "$PLAYER_COOKIE"; then
  fail "Refresh cookie jar did not change"
else
  pass "Refresh rotated authentication cookies"
fi

echo
echo "4. Old refresh token rejected"

OLD_REFRESH_TOKEN="$(
  extract_refresh_token \
    /tmp/nexgen-player-before-refresh.cookies
)"

if [ -n "$OLD_REFRESH_TOKEN" ]; then
  OLD_REFRESH_RESPONSE="$(
    curl -sS \
      -o /tmp/nexgen-player-old-refresh.json \
      -w '%{http_code}' \
      -X POST "$BASE_URL/auth/refresh" \
      -H 'Content-Type: application/json' \
      -d "{\"refreshToken\":\"$OLD_REFRESH_TOKEN\"}"
  )"

  OLD_REFRESH_BODY="$(cat /tmp/nexgen-player-old-refresh.json)"

  if assert_status "401" "$OLD_REFRESH_RESPONSE" \
    "Old refresh token is rejected"; then

    if echo "$OLD_REFRESH_BODY" | grep -q 'Refresh token not recognized'; then
      pass "Old refresh token specifically rejected as unrecognized"
    else
      fail "Old refresh token rejection did not report unrecognized token"
      echo "    Response: $OLD_REFRESH_BODY"
    fi
  fi
else
  fail "Could not extract old refresh token for rotation test"
fi

echo
echo "5. New refresh token succeeds"

NEW_REFRESH_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-player-new-refresh.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -c "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

NEW_REFRESH_BODY="$(cat /tmp/nexgen-player-new-refresh.json)"

if assert_status "201" "$NEW_REFRESH_RESPONSE" \
  "New refresh token succeeds"; then
  assert_success "$NEW_REFRESH_BODY" \
    "New refresh session remains valid"
fi

echo
echo "6. Logout"

LOGOUT_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-player-logout.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -c "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/logout" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

LOGOUT_BODY="$(cat /tmp/nexgen-player-logout.json)"

if assert_status "200" "$LOGOUT_RESPONSE" "Logout returns 200"; then
  assert_success "$LOGOUT_BODY" "Logout succeeds"
fi

echo
echo "7. Reuse logged-out session"

REUSE_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-player-reuse.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

REUSE_BODY="$(cat /tmp/nexgen-player-reuse.json)"

if assert_status "401" "$REUSE_RESPONSE" \
  "Logged-out refresh token is rejected"; then

  if echo "$REUSE_BODY" | grep -Eq \
    'Refresh token not recognized|Invalid refresh token'; then
    pass "Logged-out token specifically rejected"
  else
    fail "Logged-out token returned an unexpected rejection message"
    echo "    Response: $REUSE_BODY"
  fi
fi

# ============================================================
# EDGE CASES
# ============================================================

section "Refresh-token edge cases"

echo
echo "8. Expired refresh session rejected"

EXPIRED_COOKIE="$(mktemp)"

EXPIRED_LOGIN_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-expired-session-login.json \
    -w '%{http_code}' \
    -c "$EXPIRED_COOKIE" \
    -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{
      \"email\": \"$PLAYER_EMAIL\",
      \"password\": \"$PLAYER_PASSWORD\"
    }"
)"

EXPIRED_LOGIN_BODY="$(cat /tmp/nexgen-expired-session-login.json)"

if assert_status "201" "$EXPIRED_LOGIN_RESPONSE" \
  "Expired-session test login succeeds"; then
  assert_success "$EXPIRED_LOGIN_BODY" \
    "Expired-session test login authenticated"
fi

EXPIRED_USER_ID="$(
  printf '%s' "$EXPIRED_LOGIN_BODY" |
    sed -n 's/.*"userId":"\([^"]*\)".*/\1/p'
)"

if [ -z "$EXPIRED_USER_ID" ]; then
  fail "Could not identify user for expired-session test"
else
  EXPIRED_SESSION_ID="$(
    psql "$DATABASE_URL" -Atc "
      SELECT id
      FROM sessions
      WHERE user_id = '$EXPIRED_USER_ID'
      ORDER BY created_at DESC
      LIMIT 1;
    " 2>/dev/null
  )"

  if [ -z "$EXPIRED_SESSION_ID" ]; then
    fail "Could not identify session row for expired-session test"
  else
    if psql "$DATABASE_URL" -Atc "
      UPDATE sessions
      SET expires_at = NOW() - INTERVAL '1 minute'
      WHERE id = '$EXPIRED_SESSION_ID';
    " >/dev/null 2>&1; then

      pass "Expired-session database row prepared"

      EXPIRED_REFRESH_RESPONSE="$(
        curl -sS \
          -o /tmp/nexgen-expired-refresh.json \
          -w '%{http_code}' \
          -b "$EXPIRED_COOKIE" \
          -X POST "$BASE_URL/auth/refresh" \
          -H 'Content-Type: application/json' \
          -d '{}'
      )"

      EXPIRED_REFRESH_BODY="$(cat /tmp/nexgen-expired-refresh.json)"

      if assert_status "401" "$EXPIRED_REFRESH_RESPONSE" \
        "Expired refresh session is rejected"; then

        if echo "$EXPIRED_REFRESH_BODY" | grep -Eq \
          'expired|Expiration|Refresh token not recognized|Invalid refresh token'; then
          pass "Expired refresh token rejected by authentication layer"
        else
          fail "Expired refresh token returned an unexpected rejection"
          echo "    Response: $EXPIRED_REFRESH_BODY"
        fi
      fi
    else
      fail "Could not expire session row"
    fi
  fi
fi

rm -f "$EXPIRED_COOKIE"

echo
echo "9. Concurrent refresh requests"

CONCURRENT_LOGIN_RESPONSE="$(
  login_player \
    "$CONCURRENT_COOKIE" \
    /tmp/nexgen-concurrent-login.json
)"

CONCURRENT_LOGIN_BODY="$(cat /tmp/nexgen-concurrent-login.json)"

if ! assert_status "201" "$CONCURRENT_LOGIN_RESPONSE" \
  "Concurrent-refresh test login succeeds"; then
  echo "    Response: $CONCURRENT_LOGIN_BODY"
else
  assert_success \
    "$CONCURRENT_LOGIN_BODY" \
    "Concurrent-refresh test login authenticated"
fi

CONCURRENT_REFRESH_TOKEN="$(
  extract_refresh_token "$CONCURRENT_COOKIE"
)"

if [ -z "$CONCURRENT_REFRESH_TOKEN" ]; then
  fail "Could not extract refresh token for concurrent-refresh test"
else
  rm -f \
    /tmp/nexgen-concurrent-refresh-1.json \
    /tmp/nexgen-concurrent-refresh-2.json \
    /tmp/nexgen-concurrent-refresh-1.status \
    /tmp/nexgen-concurrent-refresh-2.status

  curl -sS \
    -o /tmp/nexgen-concurrent-refresh-1.json \
    -w '%{http_code}' \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d "{\"refreshToken\":\"$CONCURRENT_REFRESH_TOKEN\"}" \
    > /tmp/nexgen-concurrent-refresh-1.status &

  PID_1=$!

  curl -sS \
    -o /tmp/nexgen-concurrent-refresh-2.json \
    -w '%{http_code}' \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d "{\"refreshToken\":\"$CONCURRENT_REFRESH_TOKEN\"}" \
    > /tmp/nexgen-concurrent-refresh-2.status &

  PID_2=$!

  wait "$PID_1"
  wait "$PID_2"

  CONCURRENT_STATUS_1="$(cat /tmp/nexgen-concurrent-refresh-1.status)"
  CONCURRENT_STATUS_2="$(cat /tmp/nexgen-concurrent-refresh-2.status)"

  SUCCESS_COUNT=0
  REJECT_COUNT=0

  if [ "$CONCURRENT_STATUS_1" = "201" ]; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$CONCURRENT_STATUS_1" = "401" ]; then
    REJECT_COUNT=$((REJECT_COUNT + 1))
  fi

  if [ "$CONCURRENT_STATUS_2" = "201" ]; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$CONCURRENT_STATUS_2" = "401" ]; then
    REJECT_COUNT=$((REJECT_COUNT + 1))
  fi

  if [ "$SUCCESS_COUNT" -eq 1 ] &&
     [ "$REJECT_COUNT" -eq 1 ]; then
    pass "Exactly one concurrent refresh request successfully rotates the session"
  else
    fail "Concurrent refresh rotation is not atomic — expected one 201 and one 401, got $CONCURRENT_STATUS_1 and $CONCURRENT_STATUS_2"

    echo "    Response 1:"
    cat /tmp/nexgen-concurrent-refresh-1.json
    echo

    echo "    Response 2:"
    cat /tmp/nexgen-concurrent-refresh-2.json
    echo
  fi

  CONCURRENT_FINAL_RESPONSE="$(
    curl -sS \
      -o /tmp/nexgen-concurrent-final-refresh.json \
      -w '%{http_code}' \
      -b "$CONCURRENT_COOKIE" \
      -X POST "$BASE_URL/auth/refresh" \
      -H 'Content-Type: application/json' \
      -d '{}'
  )"

  if [ "$CONCURRENT_FINAL_RESPONSE" = "401" ]; then
    pass "Original concurrent refresh token cannot be reused"
  elif [ "$CONCURRENT_FINAL_RESPONSE" = "201" ]; then
    fail "Original concurrent refresh token remained reusable"
  else
    fail "Unexpected status while validating concurrent token invalidation — got HTTP $CONCURRENT_FINAL_RESPONSE"
  fi
fi

# ============================================================
# MULTI-SESSION
# ============================================================

section "Multi-session isolation"

echo
echo "10. Session A login"

SESSION_A_RESPONSE="$(
  login_player \
    "$PLAYER_COOKIE" \
    /tmp/nexgen-session-a.json
)"

SESSION_A_BODY="$(cat /tmp/nexgen-session-a.json)"

if assert_status "201" "$SESSION_A_RESPONSE" "Session A login succeeds"; then
  assert_success "$SESSION_A_BODY" "Session A authenticated"
fi

echo
echo "11. Session B login"

SESSION_B_RESPONSE="$(
  login_player \
    "$PLAYER2_COOKIE" \
    /tmp/nexgen-session-b.json
)"

SESSION_B_BODY="$(cat /tmp/nexgen-session-b.json)"

if assert_status "201" "$SESSION_B_RESPONSE" "Session B login succeeds"; then
  assert_success "$SESSION_B_BODY" "Session B authenticated"
fi

echo
echo "12. Session A refresh"

SESSION_A_REFRESH="$(
  curl -sS \
    -o /tmp/nexgen-session-a-refresh.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -c "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

assert_status "201" "$SESSION_A_REFRESH" \
  "Session A refresh succeeds"

echo
echo "13. Session B refresh"

SESSION_B_REFRESH="$(
  curl -sS \
    -o /tmp/nexgen-session-b-refresh.json \
    -w '%{http_code}' \
    -b "$PLAYER2_COOKIE" \
    -c "$PLAYER2_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

assert_status "201" "$SESSION_B_REFRESH" \
  "Session B refresh succeeds"

echo
echo "14. Logout Session A"

SESSION_A_LOGOUT="$(
  curl -sS \
    -o /tmp/nexgen-session-a-logout.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -c "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/logout" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

assert_status "200" "$SESSION_A_LOGOUT" \
  "Session A logout succeeds"

echo
echo "15. Session A cannot refresh after logout"

SESSION_A_REUSE="$(
  curl -sS \
    -o /tmp/nexgen-session-a-reuse.json \
    -w '%{http_code}' \
    -b "$PLAYER_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

assert_status "401" "$SESSION_A_REUSE" \
  "Session A is revoked"

echo
echo "16. Session B remains independent"

SESSION_B_AFTER_A="$(
  curl -sS \
    -o /tmp/nexgen-session-b-after-a.json \
    -w '%{http_code}' \
    -b "$PLAYER2_COOKIE" \
    -c "$PLAYER2_COOKIE" \
    -X POST "$BASE_URL/auth/refresh" \
    -H 'Content-Type: application/json' \
    -d '{}'
)"

assert_status "201" "$SESSION_B_AFTER_A" \
  "Session B remains valid after Session A logout"

# ============================================================
# AUTHORIZATION
# ============================================================

section "Authorization"

echo
echo "17. Unauthenticated admin request"

UNAUTH_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-unauth-admin.json \
    -w '%{http_code}' \
    "$BASE_URL/admin/users/"
)"

assert_status "401" "$UNAUTH_RESPONSE" \
  "Unauthenticated admin request returns 401"

echo
echo "18. PLAYER admin request"

PLAYER_ADMIN_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-player-admin.json \
    -w '%{http_code}' \
    -b "$PLAYER2_COOKIE" \
    "$BASE_URL/admin/users/"
)"

PLAYER_ADMIN_BODY="$(cat /tmp/nexgen-player-admin.json)"

if assert_status "403" "$PLAYER_ADMIN_RESPONSE" \
  "PLAYER admin request returns 403"; then

  if echo "$PLAYER_ADMIN_BODY" | grep -q \
    'Insufficient permission privileges'; then
    pass "PLAYER denied by PermissionsGuard"
  else
    fail "PLAYER denial did not report permission failure"
  fi
fi

echo
echo "19. HQ_ADMIN login"

ADMIN_RESPONSE="$(
  login_admin \
    "$ADMIN_COOKIE" \
    /tmp/nexgen-admin-login.json
)"

ADMIN_BODY="$(cat /tmp/nexgen-admin-login.json)"

if assert_status "201" "$ADMIN_RESPONSE" \
  "HQ_ADMIN login succeeds"; then
  assert_success "$ADMIN_BODY" \
    "HQ_ADMIN authenticated"
fi

echo
echo "20. HQ_ADMIN /users/me"

ADMIN_ME_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-admin-me.json \
    -w '%{http_code}' \
    -b "$ADMIN_COOKIE" \
    "$BASE_URL/users/me"
)"

assert_status "200" "$ADMIN_ME_RESPONSE" \
  "HQ_ADMIN /users/me succeeds"

echo
echo "21. HQ_ADMIN admin request"

ADMIN_USERS_RESPONSE="$(
  curl -sS \
    -o /tmp/nexgen-admin-users.json \
    -w '%{http_code}' \
    -b "$ADMIN_COOKIE" \
    "$BASE_URL/admin/users/"
)"

ADMIN_USERS_BODY="$(cat /tmp/nexgen-admin-users.json)"

if assert_status "200" "$ADMIN_USERS_RESPONSE" \
  "HQ_ADMIN admin request succeeds"; then

  assert_success "$ADMIN_USERS_BODY" \
    "HQ_ADMIN has required admin permission"
fi

# ============================================================
# SUMMARY
# ============================================================

section "Regression summary"

echo
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "=============================================="
  echo " ALL AUTHENTICATION/AUTHORIZATION TESTS PASS"
  echo "=============================================="
  exit 0
else
  echo "=============================================="
  echo " AUTH REGRESSION FAILED"
  echo "=============================================="
  exit 1
fi