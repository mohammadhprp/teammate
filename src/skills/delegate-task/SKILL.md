---
name: delegate-task
description: "Start a worker agent in its own project workspace tab and hand it a scoped, self-contained brief. Use when the primary agent decides to delegate one task to a new worker."
---

# Delegate a task

Create one worker in its own tab, give it everything it needs, and return
control to the loop. Use the `tm` CLI so output stays concise.

## When to use

- A ledger task exists and needs a worker.
- You need an independent worker for implementation, review, debugging,
  testing, or investigation.

## When not to use

- The task is still ambiguous: clarify it first (see `team-mate`).
- A suitable worker is already idle and linked to the same task: prompt it
  instead of spawning a new one.

## Inputs

- Project root (`--cwd`) and project name (`--project`).
- Ledger task id (`--task`).
- Worker kind: `worker_kind` from `team-mate.toml`, or `--kind`. Any kind
  accepted by `herdr agent start --kind` is supported; `tm` does not restrict
  the list.
- Worker name: unique among live agents, matching `[a-z][a-z0-9_-]{0,31}`.

## Procedure

1. **Spawn the worker.** This reuses (or creates) the Herdr workspace named
   after the project and starts the agent in a new tab there, without changing
   the developer's focus.

   ```bash
   python3 scripts/tm.py spawn --cwd "<project-root>" --project "<project>" --name "<name>" --task "<id>"
   ```

   Output is one line: `<name> <state> <project> <workspace> <tab>`.

2. **Build the brief** from `templates/worker-brief.md`: project name and root;
   the instruction to read the project's `AGENTS.md` and `CONTEXT.md`; the
   goal; every acceptance criterion; the constraints (stay in scope, no
   dependencies unless allowed, do not commit/push/publish/deploy); and the
   expected output with a short structured report at the end.

3. **Submit the brief.**

   ```bash
   python3 scripts/tm.py send "<name>" --brief "<brief-file>" --wait --timeout <ms>
   ```

   Output is one line: `<name> <state>`.

   - Serial work: use `--wait`.
   - Parallel work: omit `--wait` and track the worker with `monitor-agents`.
   - If it prints `<name> unconfirmed`, the prompt was delivered but the agent
     did not report a working state. Do not resend it. Poll with
     `monitor-agents` and confirm completion from evidence. For reliable
     lifecycle states, install the agent integration:
     `herdr integration install <kind>`.

## Output

The worker name, project, workspace, and settled state.

## Failure

`tm` prints one `error:` line and exits non-zero. If spawn fails, it rolls back
the tab it created; retry once, then escalate. If a worker is blocked during
startup, inspect it with `monitor-agents` and escalate to the developer.
