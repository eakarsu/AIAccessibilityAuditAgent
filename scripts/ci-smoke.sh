#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; : "${BACKEND_PORT:=3001}"
(cd "$root/backend" && node server.js) & pid=$!; trap 'kill "$pid" 2>/dev/null || true' EXIT
for _ in {1..30}; do curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null
code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BACKEND_PORT/api/governed-audits")"; test "$code" = 401
code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BACKEND_PORT/api/ai")"; test "$code" = 410
