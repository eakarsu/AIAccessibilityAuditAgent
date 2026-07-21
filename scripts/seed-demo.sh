#!/usr/bin/env bash
set -euo pipefail
test "${CONFIRM_DEMO_SEED:-}" = YES || { echo 'Set CONFIRM_DEMO_SEED=YES to acknowledge demo data.' >&2; exit 1; }
test "${NODE_ENV:-development}" != production || { echo 'Demo seed is disabled in production.' >&2; exit 1; }
echo 'No supported demo fixture is defined; no data was changed.'
