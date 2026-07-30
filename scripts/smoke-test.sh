#!/usr/bin/env bash
# End-to-end smoke test against a running local stack (API + Postgres + Redis).
# Exercises the full Phase 1 tutor loop: sign in -> batch -> invite ->
# student joins -> recurring sessions -> join-tap attendance.
#
# Usage: bash scripts/smoke-test.sh
set -euo pipefail

API="${API_URL:-http://localhost:3001}"
LOG="${BACKEND_LOG:-/tmp/backend.log}"
TUTOR_PHONE="${TUTOR_PHONE:-+919876511001}"
STUDENT_PHONE="${STUDENT_PHONE:-+919876511002}"

pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; echo "       $2"; exit 1; }

# Signs in (creating the account on first run) and echoes an access token.
login() {
  local phone="$1" role="$2"
  curl -sS -X POST "$API/auth/otp/request" -H 'Content-Type: application/json' \
    -d "{\"phoneE164\":\"$phone\"}" > /dev/null
  sleep 0.6
  local code
  code=$(grep "OTP for $phone:" "$LOG" | tail -1 | sed -E 's/.*: ([0-9]{6}) .*/\1/')
  [ -n "$code" ] || fail "login($phone)" "no OTP found in $LOG"
  curl -sS -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
    -d "{\"phoneE164\":\"$phone\",\"code\":\"$code\",\"signupRole\":\"$role\"}" |
    grep -oE '"accessToken":"[^"]+"' | cut -d'"' -f4
}

json_field() { grep -oE "\"$1\":\"[^\"]+\"" | head -1 | cut -d'"' -f4; }

echo "health"
curl -sS "$API/health" | grep -q '"status":"ok"' &&
  pass "api, database and redis up" || fail "health" "not ok"

echo "auth"
TUTOR_TOKEN=$(login "$TUTOR_PHONE" tutor)
STUDENT_TOKEN=$(login "$STUDENT_PHONE" student)
[ -n "$TUTOR_TOKEN" ] && [ -n "$STUDENT_TOKEN" ] &&
  pass "tutor and student signed in" || fail "auth" "missing token"

echo "catalog"
SUBJECT_ID=$(curl -sS "$API/catalog/subjects" | grep -oE '"id":"[^"]+","slug":"physics"' | cut -d'"' -f4)
CURRICULUM_ID=$(curl -sS "$API/catalog/curricula" | grep -oE '"id":"[^"]+","slug":"cbse"' | cut -d'"' -f4)
GRADE_ID=$(curl -sS "$API/catalog/curricula/$CURRICULUM_ID/grade-levels" |
  grep -oE '"id":"[^"]+","curriculum_id":"[^"]+","ordinal":10' | cut -d'"' -f4)
[ -n "$SUBJECT_ID" ] && [ -n "$GRADE_ID" ] &&
  pass "seeded subjects, curricula and grade levels readable" || fail "catalog" "missing reference data"

echo "batches"
BATCH_ID=$(curl -sS -X POST "$API/batches" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d "{\"title\":\"Smoke Test Physics\",\"subjectId\":\"$SUBJECT_ID\",\"gradeLevelId\":\"$GRADE_ID\",\"capacity\":10,\"feeMinor\":150000}" |
  json_field id)
[ -n "$BATCH_ID" ] && pass "batch created" || fail "batches" "no batch id"

echo "invites"
TOKEN=$(curl -sS -X POST "$API/invites/batch/$BATCH_ID" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" -d '{"maxUses":5}' | json_field token)
[ -n "$TOKEN" ] && pass "invite link created" || fail "invites" "no token"

curl -sS "$API/invites/$TOKEN" | grep -q 'Smoke Test Physics' &&
  pass "public invite preview shows batch (no empty state)" || fail "invites" "preview missing batch title"

curl -sS -X POST "$API/invites/$TOKEN/redeem" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '"status":"active"' &&
  pass "student redeemed invite and is enrolled" || fail "invites" "redeem did not enroll"

curl -sS "$API/batches/$BATCH_ID/students" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q "$STUDENT_PHONE" &&
  pass "student appears in tutor's roster" || fail "batches" "student missing from roster"

echo "sessions"
SESSION_ID=$(curl -sS -X POST "$API/sessions" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d "{\"batchId\":\"$BATCH_ID\",\"startLocal\":\"2026-08-03T16:00\",\"durationMin\":60,\"meetingUrl\":\"https://meet.google.com/smoke-test\",\"recurrenceRule\":\"FREQ=WEEKLY;BYDAY=MO;COUNT=4\"}" |
  json_field id)
[ -n "$SESSION_ID" ] && pass "recurring session series created" || fail "sessions" "no session id"

SESSION_COUNT=$(curl -sS "$API/sessions/batch/$BATCH_ID" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -oE '"id":"[0-9a-f-]{36}"' | wc -l | tr -d ' ')
[ "$SESSION_COUNT" -eq 4 ] &&
  pass "RRULE expanded to 4 occurrences" || fail "sessions" "expected 4 sessions, got $SESSION_COUNT"

curl -sS "$API/sessions/batch/$BATCH_ID" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"scheduled_start_utc":"2026-08-03T10:30:00.000Z"' &&
  pass "16:00 IST stored as 10:30 UTC (UTC + IANA discipline)" ||
  fail "sessions" "first occurrence not converted to UTC correctly"

echo "attendance"
curl -sS -X POST "$API/attendance/session/$SESSION_ID/join" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q 'meet.google.com' &&
  pass "join-tap recorded attendance and returned meeting link" || fail "attendance" "join failed"

curl -sS "$API/attendance/session/$SESSION_ID" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"method":"join_tap"' &&
  pass "attendance visible to tutor as join_tap" || fail "attendance" "join_tap not recorded"

curl -sS "$API/attendance/summary/batch/$BATCH_ID" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '"attendanceRate":100' &&
  pass "student attendance summary computed" || fail "attendance" "summary wrong"

echo "authorization"
curl -sS -o /dev/null -w '%{http_code}' "$API/batches/me" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '403' &&
  pass "student blocked from tutor-only endpoint" || fail "authorization" "RBAC not enforced"

curl -sS -o /dev/null -w '%{http_code}' "$API/batches/me" | grep -q '401' &&
  pass "unauthenticated request rejected" || fail "authorization" "missing auth not rejected"

echo
echo "all smoke tests passed"
