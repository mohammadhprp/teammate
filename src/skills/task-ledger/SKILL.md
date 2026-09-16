---
name: task-ledger
description: "Keep coordination state in the durable task ledger so it survives a restart or compaction: create a task before spawning its worker, link the worker that owns it, move the status at each transition, attach the report, and recover with task list / task find --worker / task show. Use whenever you create, update, or resume a delegated task — especially after the primary session restarts or compacts, or when a task's worker no longer appears in the live worker list."
---

# Task ledger

The runtime is ephemeral; the ledger is durable. A Herdr worker disappears when
its tab closes, and your context is lost when the session compacts, so the task
record under `state_dir` is what lets coordination resume. Every delegated task
lives there from before its worker is spawned to its final status — which only
works if the record is written first and updated as the work moves.

The ledger lives under `state_dir` (default `~/.teammate/`, from
`team-mate.toml`): one JSON file per task at `<state_dir>/tasks/<id>.json` plus
an append-only `<state_dir>/timeline.jsonl`. That is what makes `task list`,
`task find`, and `task show` answer after a restart. Briefs live in
`<state_dir>/briefs/` and captured reports in `<state_dir>/reports/`; both are
inside the sandbox, unlike a temp dir.

## When to use

- Before delegating: record the task first.
- At each state change: spawned, settled, review verdict, rework iteration,
  approval or rejection.
- After a restart or compaction, to reconcile the ledger against live workers.
- When a worker linked to a task is missing from `python3 scripts/tm.py status`.

## When not to use

- Work that will never be reported on — a quick question, a scratch command.
  There is nothing to resume, so a record only adds noise.

## Statuses

Keep to these; they are the whole vocabulary the CLI accepts.

| Status | Meaning | Set by |
| --- | --- | --- |
| `planned` | Recorded, not yet delegated | `task new` (default) |
| `working` | A worker owns it | `spawn --task` sets this automatically |
| `awaiting_review` | Worker settled, result not yet judged | you, after collecting the report |
| `rework` | Blocking findings, being fixed | you, with the iteration |
| `ready_for_approval` | A **build** task passed review, awaiting the developer | you, after a passing review |
| `approved` / `rejected` | The developer's decision | you, on the decision |
| `failed` | Could not complete — orphan, unrecoverable error | you, on failure |
| `cancelled` | Stopped deliberately, or superseded | you, on cancellation |

`iteration` counts review/rework cycles against `max_iterations` (default 3). A
review that ran zero checks is not a pass: record it as `rework` or leave it
`awaiting_review`, never `ready_for_approval` (see `review-change`).

## Task kind

Every task also has a `kind`: `build` (the default) or `review`. A **build**
task carries a change and ends at the developer's `ready_for_approval` gate; a
**review** task records a reviewer's findings and verdict against its build
task, can never reach `ready_for_approval`, and is not the developer's to
approve — `task decide` does not apply to it. Record one with `--kind review`:

```bash
python3 scripts/tm.py task new --kind review --project <name> --title <t> \
  --goal <g> --acceptance "<c>"
```

Reviewers are normally spawned without `--task` and own no task (step 4), so
most reviews need no ledger entry; create a `--kind review` task only when the
review itself must be tracked.

## Session and hygiene

The ledger is shared across runs, so tag each run and keep it clean.

- **Open a session when a run starts.** `python3 scripts/tm.py session start`
  prints the id and writes `<state_dir>/session.json`; every task created while
  it is open records that `session`. `tm session end` closes it.
- **`task list` shows the open session by default**, so a new run does not
  inherit stale work. Pass `--all` for every session, or `--session <id>`.
  `recover-run` reconciles only the open session.
- **Archive closed tasks.** `python3 scripts/tm.py task prune` moves closed
  tasks to `<state_dir>/archive/`; it archives, never deletes. Scope with
  `--session <id>` or `--all`.
- **Briefs and reports are ledger state too.** `tm brief` writes to
  `<state_dir>/briefs/` and `tm report --save` to `<state_dir>/reports/`; use
  those commands rather than inventing a path, because this tree is what the
  sandbox allows.

## Procedure

1. **Create before spawning.** The record must exist before the worker, or a
   crash leaves work no one can resume.

   ```bash
   python3 scripts/tm.py task new --project <name> --title <t> --goal <g> \
     --acceptance "<c>" [--acceptance "<c>"...] [--constraint "<c>"...] \
     [--max-iterations <n>]
   ```

   `--acceptance` is required and repeatable; the command prints the new task
   id. Take the goal and criteria from `plan-work`, not from memory.

2. **Link the worker when you spawn it.** Pass `--task <id>`; `spawn` records the
   worker, root, and workspace and moves the status to `working` in one step:

   ```bash
   python3 scripts/tm.py spawn --cwd "<root>" --project "<name>" --name "<worker>" --task "<id>"
   ```

   A task holds one `worker`. Spawning a second worker with the same `--task`
   overwrites the first link, so give parallel workers their own tasks; and
   reuse a worker name for one task at a time, because `task find --worker`
   resolves to an active task if any, otherwise the newest matching task — a
   closed task from an earlier session never shadows the live one.

3. **Update at each transition.** Move the status as the work moves; record the
   iteration on rework and attach the report once it exists:

   ```bash
   python3 scripts/tm.py task update <id> --status <status> [--iteration <n>] [--report-file <f>]
   ```

   Update at the transitions that matter — settled, verdict, decision — rather
   than on every event. The ledger is a resume point, not a log, and `task show`
   only renders the latest report.

4. **Recover after a restart.** Reconcile the durable ledger with the live
   runtime instead of trusting memory:

   ```bash
   python3 scripts/tm.py status                 # live workers
   python3 scripts/tm.py task list              # every recorded task
   python3 scripts/tm.py task find --worker <name>
   python3 scripts/tm.py task show <id>
   ```

   - A live worker with no ledger task is either a by-design reviewer or a lost
     record. A reviewer is spawned without `--task` and owns no task, so take
     no action and `recover-run` must not flag it as drift; any other
     unledgered live worker means the record was lost — reconcile it with
     `recover-run`.
   - A task whose recorded worker is absent from `status`: orphaned (step 5).
   - Otherwise resume from the recorded status, not from memory.

5. **Detect an orphan.** A task that records a worker missing from
   `python3 scripts/tm.py status` has lost its worker; `python3 scripts/tm.py
   status <name>` fails with `error: no agent named <name>`.

   ```bash
   python3 scripts/tm.py task update <id> --status failed
   ```

   Mark it `failed` and escalate; deciding whether to re-delegate is
   `recover-run`'s job. Never treat a missing worker as done, and never resend a
   prompt that may already have been delivered.

## Output

A durable task record — goal, acceptance criteria, status, iteration, linked
worker, and report — that a fresh session can read with `task show` and continue
from.

## Failure and escalation

- Orphaned worker → `failed`, then escalate (`recover-run`).
- Missing or unreadable `state_dir` → fix the path from `team-mate.toml` first;
  reporting a task from memory defeats the ledger's purpose.
- The recorded status contradicts what you observe (for example `planned` while
  the worker is running) → trust the evidence and correct the record.

## Related skills

- `plan-work` supplies the goal and criteria; `delegate-task` spawns the linked
  worker.
- `monitor-agents` produces the settle that `awaiting_review` records.
- `recover-run` reconciles the ledger after a restart.
