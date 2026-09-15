---
name: delegate-task
description: "Spawn one worker agent in its own project workspace tab and hand it a scoped, self-contained brief built from the task's goal and acceptance criteria. Use when starting one worker for one assignment, or when the assignment needs a specialized worker."
---

# Delegate a task

Create one worker in its own tab, give it everything it needs, and return
control to the loop. Use `python3 scripts/tm.py` so output stays concise.

## When to use

- A ledger task exists and needs a worker.
- You need an independent worker for implementation, review, debugging,
  testing, or investigation.

## When not to use

- The task is still ambiguous: clarify it first (see `plan-work`).
- A suitable worker is already idle and linked to the same task: prompt it
  instead of spawning a new one.

## Inputs

- Project root (`--cwd`) and project name (`--project`), resolved with
  `multi-project-context`.
- Ledger task id (`--task`).
- Worker kind: `worker_kind` from `team-mate.toml`, or `--kind`. Any kind
  accepted by `herdr agent start --kind` is supported; the CLI does not restrict
  the list.
- Worker name: unique among live agents, matching `[a-z][a-z0-9_-]{0,31}`.

## Procedure

1. **Spawn the worker.** This reuses (or creates) the Herdr workspace named
   after the project, distributes the common and worker skills into the project
   (`tm skills sync`), and starts the agent in a new tab there, without changing
   the developer's focus.

   ```bash
   python3 scripts/tm.py spawn --cwd "<project-root>" --project "<project>" --name "<name>" --task "<id>"
   ```

   Output is one line: `<name> <state> <project> <workspace> <tab>`.

2. **Build a self-contained brief** from `templates/worker-brief.md`: project
   name and root; the instruction to read the project's `AGENTS.md` and
   `CONTEXT.md`; the goal; every acceptance criterion; the constraints (stay in
   scope, no dependencies unless allowed, do not commit/push/publish/deploy);
   and the expected output. Inline every fact the worker needs. Never point at
   a path outside the worker's project — the primary's `tm.py`, a system temp
   dir, or `~/.teammate` — because the worker runs sandboxed to its project and
   will block on a permission dialog trying to read it. Close with the
   `handoff-report` shape — what changed, which files, the commands run and
   their results, and anything unresolved — so the report is reviewable without
   a follow-up.

3. **Write and submit the brief.** Put it in the documented location so a run
   never writes outside the sandbox; `tm brief` writes under
   `state_dir/briefs/` and prints the path.

   ```bash
   python3 scripts/tm.py brief "<name>" --task "<id>" <<'EOF'
   <brief>
   EOF
   # <state_dir>/briefs/<id>-<name>.md
   python3 scripts/tm.py send "<name>" --brief "<printed-path>"
   ```

   Output is one line: `<name> <state>`.

   - Omit `--wait`: the send returns once the brief is delivered, and the
     primary stays free. Track the worker with `monitor-agents`; do not hold the
     turn for the whole run.
   - Parallel work: also omit `--wait`, and respect `max_concurrent`
     (`parallel-coordination`).
   - If you need the completion, run the wait in a background shell rather than
     a long foreground `--wait` (`monitor-agents`).
   - If it prints `<name> unconfirmed`, the prompt was delivered but the agent
     did not report a working state. Do not resend it. Poll with
     `monitor-agents` and confirm completion from evidence. For reliable
     lifecycle states, install the agent integration:
     `herdr integration install <kind>`.

## Output

The worker name, project, workspace, and settled state.

## Failure

`python3 scripts/tm.py` prints one `error:` line and exits non-zero. If spawn fails, it rolls back
the tab it created; retry once, then escalate. If a worker is blocked during
startup, inspect it with `monitor-agents` and escalate to the developer.

A worker blocked on a permission dialog during a brief usually means the brief
pointed outside the project. Do not answer the dialog: stop the worker, inline
the missing fact, and resend (`run-rework` owns the re-brief).
