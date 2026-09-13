---
name: delegate-task
description: "Create a worker agent in its own tab and hand it a scoped, self-contained brief. Use when the primary agent decides to delegate a task."
---

# Delegate a task

Create one worker in its own tab, give it everything it needs, and return
control to the loop. Use the `tm` CLI so output stays concise.

## Inputs

- Project root (`cwd`).
- Goal and acceptance criteria (at least one).
- Constraints.
- Worker kind: `worker_kind` from `team-mate.toml`, or a task override. Any
  kind accepted by `herdr agent start --kind` is supported; `tm` does not
  restrict the list.
- Worker name: unique among live agents, matching `[a-z][a-z0-9_-]{0,31}`.

## Procedure

1. **Spawn the worker.** This reuses (or creates) the Herdr workspace named
   after the project and starts the agent in a new tab there. It does not
   change the developer's focus.

   ```bash
   python3 scripts/tm.py spawn --cwd "<project-root>" --project "<project>" --name "<name>"
   ```

   Output is one line: `<name> <state> <project> <workspace> <tab>`.

2. **Build the brief** from the worker brief template: project name and root,
   the instruction to read the project's `AGENTS.md` and `CONTEXT.md`, the
   goal, every acceptance criterion, the constraints (stay in scope, do not add
   dependencies unless allowed, do not commit/push/publish/deploy), and the
   expected output with a short structured report at the end.

3. **Send the brief.**

   ```bash
   python3 scripts/tm.py send "<name>" --brief "<brief-file>" --wait --timeout <ms>
   ```

   Output is one line: `<name> <state>`. Use `--wait` for serial work. If it
   prints `<name> unconfirmed`, the prompt was delivered but the agent did not
   report a working state; do not resend it — poll with `monitor-agents` and
   confirm completion from evidence. For reliable lifecycle states, the worker
   kind needs its Herdr integration (`herdr integration install <kind>`). For
   parallel work, omit `--wait` and track the worker with `monitor-agents`.

4. **Record** the worker name, project root, and tab for the task.

## Output

The worker name, project root, and settled state.

## Failure

`tm` prints one `error:` line. If spawn fails, retry once, then escalate. If a
worker is blocked during startup, inspect it with `monitor-agents` and escalate
to the developer.
