#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$root"
test -f .env || { echo 'Missing .env; copy .env.example and configure it.' >&2; exit 1; }
set -a; source .env; set +a; : "${BACKEND_PORT:=3001}" "${FRONTEND_PORT:=3000}"
export RUNTIME_PROJECT_NAME="AI Accessibility Audit Agent"
export RUNTIME_AI_ENDPOINT="/api/ai/accessibility-audit-review"
export RUNTIME_AI_FEATURE="accessibility-audit-review"
export RUNTIME_AI_SYSTEM_PROMPT="Review accessibility evidence against WCAG expectations, identify reproducible findings, and distinguish automated checks from required human review."
test -d backend/node_modules && test -d frontend/node_modules || { echo 'Dependencies absent; run scripts/bootstrap.sh.' >&2; exit 1; }
if [[ "${BOOTSTRAP_ACKNOWLEDGEMENT:-}" == "create-initial-admin" ]]; then
  npm --prefix backend run create-admin
fi
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do if lsof -ti ":$port" >/dev/null 2>&1; then echo "Port $port is occupied; refusing to terminate another process." >&2; exit 1; fi; done
(cd backend && npm start) & backend_pid=$!
(cd frontend && HOST=127.0.0.1 PORT="$FRONTEND_PORT" VITE_API_URL="http://127.0.0.1:$BACKEND_PORT/api" npm start) & frontend_pid=$!
cleanup(){ kill "$backend_pid" "$frontend_pid" 2>/dev/null || true; }; trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
