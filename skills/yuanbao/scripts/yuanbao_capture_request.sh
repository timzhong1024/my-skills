#!/usr/bin/env bash
set -euo pipefail

exec node "$(dirname "$0")/yuanbao_capture_request.mjs" "$@"
