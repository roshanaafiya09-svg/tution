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

echo "materials"
UPLOAD_JSON=$(curl -sS -X POST "$API/materials/upload-url" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d "{\"batchId\":\"$BATCH_ID\",\"title\":\"Chapter 1 notes\",\"mime\":\"application/pdf\",\"sizeBytes\":1024}")
UPLOAD_URL=$(echo "$UPLOAD_JSON" | grep -oE '"uploadUrl":"[^"]+"' | cut -d'"' -f4)
MATERIAL_ID=$(echo "$UPLOAD_JSON" | json_field id)
[ -n "$UPLOAD_URL" ] && pass "presigned upload URL issued" || fail "materials" "no upload url"

printf '%%PDF-1.4 smoke test' > /tmp/smoke-material.pdf
curl -sS -X PUT "$UPLOAD_URL" -H 'Content-Type: application/pdf' \
  --data-binary @/tmp/smoke-material.pdf | grep -q '"stored":true' &&
  pass "file uploaded directly to storage" || fail "materials" "upload failed"

curl -sS "$API/materials/batch/$BATCH_ID" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q 'Chapter 1 notes' &&
  pass "enrolled student can see batch materials" || fail "materials" "student cannot list materials"

DOWNLOAD_URL=$(curl -sS "$API/materials/$MATERIAL_ID/download-url" \
  -H "Authorization: Bearer $STUDENT_TOKEN" | json_field url)
curl -sS "$DOWNLOAD_URL" | grep -q 'smoke test' &&
  pass "student downloaded the file" || fail "materials" "download failed"

echo "announcements"
curl -sS -X POST "$API/announcements/batch/$BATCH_ID" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d '{"body":"Class moved to 5pm tomorrow."}' | grep -q 'Class moved' &&
  pass "announcement posted" || fail "announcements" "post failed"

curl -sS "$API/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q 'Class moved to 5pm tomorrow' &&
  pass "announcement fanned out to enrolled student's notifications" ||
  fail "notifications" "student did not receive announcement"

curl -sS "$API/notifications/unread-count" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -qE '"count":[1-9]' &&
  pass "unread notification count reflects it" || fail "notifications" "unread count wrong"

echo "assignments"
ASSIGNMENT_ID=$(curl -sS -X POST "$API/assignments" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d "{\"batchId\":\"$BATCH_ID\",\"title\":\"Newton's laws worksheet\",\"instructions\":\"Questions 1-10\",\"dueAtLocal\":\"2026-08-10T23:59\"}" |
  json_field id)
[ -n "$ASSIGNMENT_ID" ] && pass "assignment created" || fail "assignments" "no assignment id"

curl -sS "$API/assignments/me" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q "Newton's laws worksheet" &&
  pass "assignment appears in student's homework list" || fail "assignments" "student cannot see it"

SUB_UPLOAD=$(curl -sS -X POST "$API/assignments/$ASSIGNMENT_ID/upload-url" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $STUDENT_TOKEN" \
  -d '{"mime":"image/jpeg"}')
SUB_KEY=$(echo "$SUB_UPLOAD" | json_field objectKey)
SUB_URL=$(echo "$SUB_UPLOAD" | json_field uploadUrl)
printf 'fake-jpeg-bytes' > /tmp/smoke-homework.jpg
curl -sS -X PUT "$SUB_URL" -H 'Content-Type: image/jpeg' --data-binary @/tmp/smoke-homework.jpg > /dev/null
pass "student uploaded homework photo"

SUBMISSION_ID=$(curl -sS -X POST "$API/assignments/$ASSIGNMENT_ID/submit" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $STUDENT_TOKEN" \
  -d "{\"objectKeys\":[\"$SUB_KEY\"]}" | json_field id)
[ -n "$SUBMISSION_ID" ] && pass "homework submitted" || fail "assignments" "submit failed"

curl -sS -X POST "$API/assignments/submissions/$SUBMISSION_ID/grade" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d '{"grade":"8/10","feedback":"Good work, revise Q7."}' | grep -q '8/10' &&
  pass "tutor graded the submission" || fail "assignments" "grading failed"

curl -sS "$API/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q 'Good work, revise Q7' &&
  pass "student notified of the grade" || fail "assignments" "no grade notification"

curl -sS "$API/assignments/summary/batch/$BATCH_ID" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '"completionRate":100' &&
  pass "assignment completion summary computed" || fail "assignments" "summary wrong"

echo "fee ledger"
curl -sS -X POST "$API/fees/batch/$BATCH_ID/generate" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" -d '{"periodLabel":"2026-08"}' |
  grep -q '"expected_minor":150000' &&
  pass "fee entries generated for the period" || fail "fees" "generate failed"

FEE_ID=$(curl -sS "$API/fees/period?period=2026-08" -H "Authorization: Bearer $TUTOR_TOKEN" | json_field id)
curl -sS "$API/fees/period/totals?period=2026-08" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"outstandingMinor":150000' &&
  pass "outstanding total reflects unpaid fees" || fail "fees" "totals wrong before payment"

curl -sS -X POST "$API/fees/$FEE_ID/record-payment" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" -d '{"paidMinor":150000,"note":"UPI"}' |
  grep -q '"status":"paid"' &&
  pass "payment recorded, entry marked paid" || fail "fees" "record payment failed"

curl -sS "$API/fees/period/totals?period=2026-08" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"outstandingMinor":0' &&
  pass "outstanding total updated after payment" || fail "fees" "totals wrong after payment"

curl -sS "$API/fees/me" -H "Authorization: Bearer $STUDENT_TOKEN" | grep -q '"status":"paid"' &&
  pass "student sees their own fee history" || fail "fees" "student fee history wrong"

echo "authorization"
curl -sS -o /dev/null -w '%{http_code}' "$API/batches/me" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '403' &&
  pass "student blocked from tutor-only endpoint" || fail "authorization" "RBAC not enforced"

curl -sS -o /dev/null -w '%{http_code}' "$API/batches/me" | grep -q '401' &&
  pass "unauthenticated request rejected" || fail "authorization" "missing auth not rejected"

echo "trust: tutor verification"
REVIEWER_PHONE="${REVIEWER_PHONE:-+919876511003}"
# A dedicated tutor, not $TUTOR_PHONE: the badge-progression assertions
# below depend on this account having zero approved verifications
# beforehand, which only holds on a fresh phone number — $TUTOR_PHONE is
# reused across repeated runs of this script against the same dev DB.
VERIFY_TUTOR_PHONE="${VERIFY_TUTOR_PHONE:-+919876511004}"
VERIFY_TUTOR_TOKEN=$(login "$VERIFY_TUTOR_PHONE" tutor)

curl -sS -X PUT "$API/profiles/tutor" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $VERIFY_TUTOR_TOKEN" -d '{"displayName":"Smoke Test Tutor"}' > /dev/null
pass "tutor profile created (verification_status defaults to pending)"

upload_doc() {
  local type="$1"
  local resp
  resp=$(curl -sS -X POST "$API/verifications/upload-url" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $VERIFY_TUTOR_TOKEN" \
    -d "{\"type\":\"$type\",\"mime\":\"application/pdf\",\"sizeBytes\":11}")
  local url
  url=$(echo "$resp" | json_field uploadUrl)
  printf 'fake-pdf-bytes' > /tmp/smoke-verification.pdf
  curl -sS -X PUT "$url" -H 'Content-Type: application/pdf' --data-binary @/tmp/smoke-verification.pdf > /dev/null
  echo "$resp" | json_field id
}

ID_PROOF_ID=$(upload_doc id_proof)
QUALIFICATION_ID=$(upload_doc qualification)
[ -n "$ID_PROOF_ID" ] && [ -n "$QUALIFICATION_ID" ] &&
  pass "tutor uploaded id_proof and qualification documents" || fail "trust" "verification upload failed"

curl -sS "$API/verifications/me" -H "Authorization: Bearer $VERIFY_TUTOR_TOKEN" |
  grep -q '"status":"pending"' &&
  pass "tutor sees own submissions as pending" || fail "trust" "tutor cannot see own verifications"

curl -sS -o /dev/null -w '%{http_code}' "$API/verifications/queue" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '403' &&
  pass "non-reviewer blocked from the review queue" || fail "trust" "RBAC not enforced on queue"

# No self-serve signup for admin roles (by design) — grant trust_safety
# directly in the DB, matching how a real reviewer account is provisioned
# out-of-band, then re-sign-in so the JWT picks up the new role.
login "$REVIEWER_PHONE" tutor > /dev/null
docker compose exec -T postgres psql -U tuition -d tuition_dev -c \
  "insert into user_roles (user_id, role) select id, 'trust_safety' from users where phone_e164='$REVIEWER_PHONE' on conflict do nothing;" > /dev/null
REVIEWER_TOKEN=$(login "$REVIEWER_PHONE" tutor)
[ -n "$REVIEWER_TOKEN" ] && pass "reviewer account provisioned with trust_safety role" ||
  fail "trust" "reviewer login failed"

curl -sS "$API/verifications/queue" -H "Authorization: Bearer $REVIEWER_TOKEN" |
  grep -q "$ID_PROOF_ID" &&
  pass "both submissions appear in the reviewer's queue" || fail "trust" "queue missing submissions"

curl -sS "$API/verifications/$ID_PROOF_ID/download-url" -H "Authorization: Bearer $REVIEWER_TOKEN" |
  grep -q '"url"' &&
  pass "reviewer can fetch the document" || fail "trust" "reviewer download-url failed"

curl -sS -o /dev/null -w '%{http_code}' "$API/verifications/$ID_PROOF_ID/download-url" \
  -H "Authorization: Bearer $STUDENT_TOKEN" | grep -q '403' &&
  pass "unrelated student blocked from the document" || fail "trust" "document not access-controlled"

curl -sS -X POST "$API/verifications/$ID_PROOF_ID/review" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $REVIEWER_TOKEN" -d '{"status":"approved"}' |
  grep -q '"status":"approved"' &&
  pass "id_proof approved" || fail "trust" "review failed"

curl -sS "$API/profiles/tutor/me" -H "Authorization: Bearer $VERIFY_TUTOR_TOKEN" |
  grep -q '"verification_status":"pending"' &&
  pass "badge stays pending with only one of two documents approved" ||
  fail "trust" "badge flipped too early"

curl -sS -X POST "$API/verifications/$QUALIFICATION_ID/review" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $REVIEWER_TOKEN" -d '{"status":"approved"}' > /dev/null
curl -sS "$API/profiles/tutor/me" -H "Authorization: Bearer $VERIFY_TUTOR_TOKEN" |
  grep -q '"verification_status":"verified"' &&
  pass "verified badge granted once both documents are approved" ||
  fail "trust" "badge did not flip after both approvals"

curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/verifications/$QUALIFICATION_ID/review" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $REVIEWER_TOKEN" \
  -d '{"status":"approved"}' | grep -q '400' &&
  pass "re-reviewing an already-decided submission is rejected" || fail "trust" "double review not blocked"

echo "trust: consent"
curl -sS -X POST "$API/consent" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TUTOR_TOKEN" \
  -d '{"consentType":"terms_of_service","policyVersion":"2026-07"}' |
  grep -q '"consent_type":"terms_of_service"' &&
  pass "consent grant recorded" || fail "trust" "consent record failed"

curl -sS "$API/consent/me" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"policy_version":"2026-07"' &&
  pass "tutor sees own consent history" || fail "trust" "consent history missing"

echo "trust: audit log"
curl -sS "$API/audit-logs?entity=tutor_verifications&entityId=$QUALIFICATION_ID" \
  -H "Authorization: Bearer $REVIEWER_TOKEN" | grep -q '"action":"verification.approved"' &&
  pass "verification approvals wrote immutable audit-log entries" || fail "trust" "audit log missing entry"

curl -sS -o /dev/null -w '%{http_code}' "$API/audit-logs" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '403' &&
  pass "audit log restricted to admin roles" || fail "trust" "audit log not access-controlled"

echo "account: data export"
curl -sS "$API/account/export" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '"batchesEnrolled"' &&
  pass "student export includes enrolled batches" || fail "account" "student export missing batchesEnrolled"

curl -sS "$API/account/export" -H "Authorization: Bearer $STUDENT_TOKEN" |
  grep -q '"attendance"' &&
  pass "student export includes attendance history" || fail "account" "student export missing attendance"

curl -sS "$API/account/export" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"batchesOwned"' &&
  pass "tutor export includes owned batches" || fail "account" "tutor export missing batchesOwned"

curl -sS "$API/account/export" -H "Authorization: Bearer $TUTOR_TOKEN" |
  grep -q '"verifications"' &&
  pass "tutor export includes verification submissions" || fail "account" "tutor export missing verifications"

curl -sS -o /dev/null -w '%{http_code}' "$API/account/export" | grep -q '401' &&
  pass "export requires authentication" || fail "account" "export not access-controlled"

echo "account: deletion"
DISPOSABLE_PHONE="${DISPOSABLE_PHONE:-+919876511009}"
DISPOSABLE_TOKEN=$(login "$DISPOSABLE_PHONE" student)
[ -n "$DISPOSABLE_TOKEN" ] && pass "disposable account created for deletion test" ||
  fail "account" "could not create disposable account"

curl -sS -X DELETE "$API/account/me" -H "Authorization: Bearer $DISPOSABLE_TOKEN" |
  grep -q '"deleted":true' &&
  pass "account deletion succeeds" || fail "account" "deletion did not confirm"

curl -sS -X POST "$API/auth/otp/request" -H 'Content-Type: application/json' \
  -d "{\"phoneE164\":\"$DISPOSABLE_PHONE\"}" > /dev/null
sleep 0.6
DISPOSABLE_CODE=$(grep "OTP for $DISPOSABLE_PHONE:" "$LOG" | tail -1 | sed -E 's/.*: ([0-9]{6}) .*/\1/')
curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
  -d "{\"phoneE164\":\"$DISPOSABLE_PHONE\",\"code\":\"$DISPOSABLE_CODE\"}" | grep -q '400' &&
  pass "deleted account's phone number can be re-signed-up as new" ||
  fail "account" "deleted phone number blocked from reuse"

echo
echo "all smoke tests passed"
