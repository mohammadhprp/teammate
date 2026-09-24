---
name: delegate-task
description: "Delegate one worker by calling your harness's native subagent tool with a scoped, self-contained brief built from the task's goal and acceptance criteria, then link the worker to its ledger task. Use when starting one worker for one assignment, or when the assignment needs a specialized worker."
---

# Delegate a task

Hand one assignment to one worker subagent, give it everything it needs, and
return control to the loop. The brief *is* the prompt: the harness's subagent
tool runs the worker, and `python3 scripts/tm.py` only persists the brief and
records the link.

Run `python3 scripts/tm.py harness` to see the resolved harness and its adapter
fields; prefer that over hardcoding.

## When to use

- A ledger task exists and needs a worker.
- You need an independent worker for implementation, review, debugging,
  testing, or investigation.

## When not to use

- The task is still ambiguous: clarify it first (see `plan-work`).
- A suitable worker is already linked to the same task and still running: let
  it return rather than delegating again.

## Inputs

- Project root and project name, resolved with `multi-project-context`.
- Ledger task id (`task-ledger`).
- Worker role: the assignment decides it — `developer`, `reviewer`, `tester`,
  or `investigator` — rendered from `src/agents/` by `tm agents sync`.
- Worker name: unique among active workers, matching `[a-z][a-z0-9_-]{0,31}`.
- The resolved harness (`tm harness`): which subagent tool to call, and whether
  it supports background subagents.

## Procedure

1. **Prepare the project's harness surface.** Render the skills and agent
   definitions the worker's harness loads, once per project:

   ```bash
   python3 scripts/tm.py skills sync --cwd "<project-root>"
   python3 scripts/tm.py agents sync --cwd "<project-root>"
   ```

2. **Build a self-contained brief** from `templates/worker-brief.md`: project
   name and root; the instruction to read the project's `AGENTS.md` and
   `CONTEXT.md`; the goal; every acceptance criterion; the constraints (stay in
   scope, no dependencies unless allowed, do not commit/push/publish/deploy);
   and the expected output. Inline every fact the worker needs. Never point at
   a path outside the worker's project — the primary's `tm.py`, a system temp
   dir, or `~/.teammate` — because the worker runs sandboxed to its project and
   will block on a permission dialog trying to read it. Close with the
   `handoff-report` shape — what changed, which files, the commands run and
   their results, and anything unresolved — and tell it to write
   `.teammate-report.md` in the project root.

3. **Persist the brief.** `tm brief` writes under `state_dir/<project>/briefs/`
   (the project comes from `--task`) and prints the path, so the run never
   writes outside the sandbox and a restart can recover it:

   ```bash
   python3 scripts/tm.py brief "<name>" --task "<id>" <<'EOF'
   <brief>
   EOF
   # <state_dir>/<project>/briefs/<id>-<name>.md
   ```

4. **Call the harness's subagent tool** with the brief as the prompt, using the
   tool `tm harness` reports:

   - `opencode`: `task` with `subagent_type` (the worker role), `prompt` (the
     brief), `description` (a short label), and `background` for parallel work.
   - `codex`: `spawn_agent` with the brief, then `wait_agent` to collect,
     `send_input` to follow up, and `close_agent` when done. It is
     prompt-mediated, so ask explicitly for what you need.
   - `claude`: `Agent` with `subagent_type`, `prompt`, `description`, and
     `run_in_background` for parallel work.
   - `pi`: the `subagent` tool from a Pi extension/package; there is no native
     subagent, so this depends on the extension.
   - `omp`: `task` with a batch `tasks[]` (or a flat call); background by
     default.

5. **Link the worker to its task.** The harness owns the worker; the ledger
   records who owns the task:

   ```bash
   python3 scripts/tm.py task update "<id>" --worker "<name>" --status working
   ```

6. **For parallel work, use the harness's background support.** A foreground
   subagent call returns its result; a background one notifies on completion.
   Start every stream, then let the notifications arrive — do not block on the
   first (`parallel-coordination`), and respect `max_concurrent`.

## Output

The worker linked to its ledger task and, when the subagent returns, its result
and `.teammate-report.md`.

## Failure

`python3 scripts/tm.py` prints one `error:` line and exits non-zero. If the
harness's subagent tool fails to start the worker, retry once, then escalate. A
worker that returns a question is blocked: carry it to the developer with
`escalate-decision`; do not answer for it. Cancel a worker that must stop
through the harness's own control (for example codex `close_agent`); `tm` does
not manage it. A worker blocked on a permission dialog during a brief usually
means the brief pointed outside the project; cancel it, inline the missing
fact, and re-delegate (`run-rework` owns the re-brief).
