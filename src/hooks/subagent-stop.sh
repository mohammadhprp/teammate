#!/bin/sh
# Claude plugin SubagentStop hook: capture the worker's .teammate-report.md.
#
# Best-effort by contract: a missing `tm`, a failed command, or an absent report
# must not break the session. Always exits 0.

set -u

root=${CLAUDE_PLUGIN_ROOT:-}
tm="$root/bin/tm"

input=$(cat 2>/dev/null || true)

# Locate the worker's project root and, when Claude reports one, the subagent's
# name. Fall back to the project dir Claude exports, then PWD.
cwd=""
name=""
if command -v python3 >/dev/null 2>&1; then
  cwd=$(printf '%s' "$input" | python3 -c \
    'import json,sys; print(json.load(sys.stdin).get("cwd", ""))' 2>/dev/null || true)
  name=$(printf '%s' "$input" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); print(d.get("agent_type") or d.get("agent_name") or "")' 2>/dev/null || true)
fi
[ -n "$cwd" ] || cwd=${CLAUDE_PROJECT_DIR:-$PWD}

report="$cwd/.teammate-report.md"
[ -f "$report" ] || exit 0

project=$(basename -- "$cwd" 2>/dev/null || printf 'project')
[ -n "$project" ] || project=project
[ -n "$name" ] || name=$project

# Preferred path: let `tm` capture the report into the project's ledger.
if [ -x "$tm" ]; then
  "$tm" report "$name" --save --project "$project" >/dev/null 2>&1 || true
fi

# Fallback: copy the report with the bundled store when `tm` is absent or did
# not take it, so the artifact is never lost. Resolve state_dir the way `tm`
# does, from the worker's team-mate.toml, defaulting to ~/.teammate.
scripts="$root/scripts"
if command -v python3 >/dev/null 2>&1 && [ -f "$scripts/task_store.py" ]; then
  TM_REPORT="$report" TM_CWD="$cwd" TM_PROJECT="$project" \
    PYTHONPATH="$scripts${PYTHONPATH:+:$PYTHONPATH}" python3 - <<'PY' >/dev/null 2>&1 || true
import os, shutil, time
import task_store

state_dir = "~/.teammate"
try:
    import tm
    config = tm.load_config(os.path.join(os.environ["TM_CWD"], "team-mate.toml"))
    state_dir = config.get("state_dir", state_dir)
except Exception:
    pass

project = os.environ["TM_PROJECT"]
directory = task_store.reports_dir(state_dir, project)
os.makedirs(directory, exist_ok=True)
destination = os.path.join(directory, f"{project}-{int(time.time() * 1000)}.md")
shutil.copyfile(os.environ["TM_REPORT"], destination)
PY
fi

exit 0
