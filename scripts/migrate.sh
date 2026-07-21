#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if test -f "$root/.env"; then set -a; source "$root/.env"; set +a; fi
: "${DATABASE_URL:?DATABASE_URL is required through the environment or .env}"
for migration in "$root"/backend/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"; done
