#!/usr/bin/env bash
# CI smoke test for the supported runtime path:
#   runtime login -> governed audit create -> submit -> independent review,
#   plus the quarantine boundary for legacy routes.
#
# Provisioning is opt-in (RUNTIME_SETUP=1) and must point at a disposable
# database; this script refuses to run without the explicit flag.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${BACKEND_PORT:=3001}"
export RUNTIME_AI_ENDPOINT="${RUNTIME_AI_ENDPOINT:-/api/ai/runtime-acceptance}"
export RUNTIME_AI_FEATURE="${RUNTIME_AI_FEATURE:-ci-smoke}"
export RUNTIME_TENANT_ID="${RUNTIME_TENANT_ID:-runtime-app}"
export ENABLE_LEGACY_PROTOTYPE_ROUTES=false
: "${RUNTIME_SETUP:=0}"
export RUNTIME_SETUP

if test "$RUNTIME_SETUP" != "1"; then
  echo 'ci-smoke.sh requires RUNTIME_SETUP=1 and a disposable database (it provisions runtime operators).' >&2
  exit 1
fi
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PROVISION_ADMIN_EMAIL:?PROVISION_ADMIN_EMAIL is required}"
: "${PROVISION_ADMIN_PASSWORD:?PROVISION_ADMIN_PASSWORD is required}"
: "${PROVISION_REVIEWER_EMAIL:?PROVISION_REVIEWER_EMAIL is required}"
: "${PROVISION_REVIEWER_PASSWORD:?PROVISION_REVIEWER_PASSWORD is required}"

base="http://127.0.0.1:$BACKEND_PORT"

# Extract a dotted field from a JSON document on stdin ("" when absent).
json_field() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v;try{v=JSON.parse(s)}catch{process.exit(2)};for(const k of process.argv[1].split(".")){if(v==null)break;v=v[k];}process.stdout.write(v==null?"":String(v));})' "$1"
}

(cd "$root/backend" && exec node server.js) & pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

for _ in {1..50}; do curl --max-time 2 -fsS "$base/api/health" >/dev/null 2>&1 && break; sleep 0.2; done
curl --max-time 10 -fsS "$base/api/health" >/dev/null

# --- authentication boundary -------------------------------------------------
code="$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' "$base/api/governed-audits")"; test "$code" = 401
code="$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' "$base/api/governed-audits" -H 'Authorization: Bearer not-a-real-token')"; test "$code" = 403

# --- runtime login (opaque session token) ------------------------------------
admin_login="$(curl --max-time 15 -fsS -X POST "$base/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PROVISION_ADMIN_EMAIL\",\"password\":\"$PROVISION_ADMIN_PASSWORD\"}")"
admin_token="$(printf '%s' "$admin_login" | json_field token)"
test -n "$admin_token"

me="$(curl --max-time 15 -fsS "$base/api/auth/me" -H "Authorization: Bearer $admin_token")"
test "$(printf '%s' "$me" | json_field user.email)" = "$PROVISION_ADMIN_EMAIL"

# The governed API must accept the product's own login token.
curl --max-time 15 -fsS "$base/api/governed-audits" -H "Authorization: Bearer $admin_token" >/dev/null

# --- create -> submit -> review ---------------------------------------------
idem="ci-smoke-$(date +%s)-$$"
payload='{"targetUrl":"https://example.com/","authorizedHost":"example.com","authorizationReference":"ci-contract","sourceRevision":"ci-rev","axeRun":{"runId":"axe-ci-1","engineVersion":"4.10","startedAt":"2026-09-28T00:00:00Z","completedAt":"2026-09-28T00:01:00Z","findings":[{"ruleId":"image-alt","wcagCriterion":"1.1.1","impact":"critical","selector":"img.hero","evidenceHash":"sha256:ci"}]}}'

created="$(curl --max-time 15 -fsS -X POST "$base/api/governed-audits" -H "Authorization: Bearer $admin_token" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $idem" -d "$payload")"
audit_id="$(printf '%s' "$created" | json_field id)"
test -n "$audit_id"
test "$(printf '%s' "$created" | json_field status)" = "reproduced"

replayed="$(curl --max-time 15 -fsS -X POST "$base/api/governed-audits" -H "Authorization: Bearer $admin_token" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $idem" -d "$payload")"
test "$(printf '%s' "$replayed" | json_field id)" = "$audit_id"

submitted="$(curl --max-time 15 -fsS -X POST "$base/api/governed-audits/$audit_id/submit" -H "Authorization: Bearer $admin_token")"
test "$(printf '%s' "$submitted" | json_field status)" = "pending_manual_review"

# An independent reviewer is required.
reviewer_login="$(curl --max-time 15 -fsS -X POST "$base/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PROVISION_REVIEWER_EMAIL\",\"password\":\"$PROVISION_REVIEWER_PASSWORD\"}")"
reviewer_token="$(printf '%s' "$reviewer_login" | json_field token)"
test -n "$reviewer_token"

reviewed="$(curl --max-time 15 -fsS -X POST "$base/api/governed-audits/$audit_id/review" -H "Authorization: Bearer $reviewer_token" \
  -H 'Content-Type: application/json' \
  -d '{"decision":"approve","reason":"CI reviewer verified the reproducible evidence","assistiveTechnologyEvidenceRef":"ci-ate-ref"}')"
test "$(printf '%s' "$reviewed" | json_field status)" = "reviewed"

# --- legacy quarantine -------------------------------------------------------
code="$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' "$base/api/ai")"; test "$code" = 410
