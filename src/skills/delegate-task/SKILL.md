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

4. **Choose background or foreground, then call the harness's subagent tool**
   with the brief as the prompt, using the tool `tm harness` reports.

   **Default to background.** Dispatch a worker in the background unless the
   primary's very next step depends on its result within this same turn. A
   foreground call holds the turn and makes the primary unreachable, so the
   developer cannot steer, correct, or ask anything while it runs; a background
   call returns immediately and notifies on completion. As a rule of thumb, if
   the worker is expected to do more than a moment's work — anything beyond a
   trivial, fast step the primary must have before it can continue — dispatch it
   in the background.

   Foreground is the exception, and the primary should be able to name the
   reason in one clause ("needs this result to decide the next step now"). Never
   leave a worker foreground merely because foreground is the pattern in use; a
   rework, a review, an investigation, or any multi-file change is background.

   Background dispatch changes how the turn ends: the primary starts the
   worker, briefly says what it launched, and ends its turn, then acts on the
   completion notification. Do not sleep, poll, or wait after a background
   dispatch.

   Per-harness argument:

   - `opencode`: `subagent` with `agent` (the worker role), `prompt` (the
     brief), `description` (a short label), and `background: true` by default.
   - `codex`: `spawn_agent` with the brief, then `wait_agent` to collect,
     `send_input` to follow up, and `close_agent` when done. It is
     prompt-mediated, so ask explicitly for what you need.
   - `claude`: `Agent` with `subagent_type`, `prompt`, `description`, and
     `run_in_background: true` by default.
   - `pi`: the `subagent` tool from a Pi extension/package; there is no native
     subagent, so this depends on the extension.
   - `omp`: `task` with a batch `tasks[]` (or a flat call); background by
     default.

   If the resolved harness cannot background, say so plainly instead of holding
   the turn silently.

5. **Link the worker to its task.** Do this *before* the subagent call so a
   background worker is recorded the moment it starts (the harness owns the
   worker; the ledger records who owns the task):

   ```bash
   python3 scripts/tm.py task update "<id>" --worker "<name>" --status working
   ```

6. **For several streams, start each as a background subagent.** A background
   one notifies on completion. Start every stream, then end the turn and let the
   notifications arrive — do not block on the first (`parallel-coordination`),
   and respect `max_concurrent`.

## Output

The worker linked to its ledger task and, when the subagent returns, its result
and `.teammate-report.md`. A background worker returns control immediately; its
result arrives on the completion notification.

## Failure

`python3 scripts/tm.py` prints one `error:` line and exits non-zero. If the
harness's subagent tool fails to start the worker, retry once, then escalate. A
worker that returns a question is blocked: carry it to the developer with
`escalate-decision`; do not answer for it. Cancel a worker that must stop
through the harness's own control (for example codex `close_agent`); `tm` does
not manage it. A worker blocked on a permission dialog during a brief usually
means the brief pointed outside the project; cancel it, inline the missing
fact, and re-delegate (`run-rework` owns the re-brief).
