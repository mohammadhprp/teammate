#!/bin/sh
# Claude plugin SessionStart hook: record an open Team Mate session.
#
# Best-effort by contract: the ledger is useful but never required, so a missing
# `tm` or a failed command must not break the session. Always exits 0.

set -u

root=${CLAUDE_PLUGIN_ROOT:-}
tm="$root/bin/tm"
[ -x "$tm" ] || exit 0

input=$(cat 2>/dev/null || true)

# Prefer the cwd Claude reports for this session, then its project dir, then PWD.
cwd=""
if command -v python3 >/dev/null 2>&1; then
  cwd=$(printf '%s' "$input" | python3 -c \
    'import json,sys; print(json.load(sys.stdin).get("cwd", ""))' 2>/dev/null || true)
fi
[ -n "$cwd" ] || cwd=${CLAUDE_PROJECT_DIR:-$PWD}

project=$(basename -- "$cwd" 2>/dev/null || printf 'project')
[ -n "$project" ] || project=project

"$tm" session start --project "$project" >/dev/null 2>&1 || true
exit 0
