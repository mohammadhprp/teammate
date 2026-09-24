---
name: recover-run
description: "Reconcile the durable ledger with the evidence a run left behind after a primary restart or a lost worker: `tm` cannot list live subagents, so classify each task from its brief, report, and diff, cancel what is unsafe, re-delegate what was lost, and never resend a brief that may already have landed. Use when the primary session restarted or compacted mid-run, when a worker is missing or stalled, or when the developer asks what happened to work that was running."
---

# Recover a run

A run breaks in two ways: the primary's context is lost (restart or compaction)
while workers keep running, or a worker stops making progress. The ledger
survives the primary; the subagent calls do not. Because `tm` is ledger-only it
cannot list live subagents, so recovery reconciles the ledger against the
evidence on disk — the brief, `.teammate-report.md`, and the diff.

The dangerous mistake is re-sending a brief whose first delivery may already
have taken effect. A worker that received it may already have edited files, and
a resend duplicates that work. When delivery cannot be ruled out, escalate: a
question is cheaper than a duplicated change.

## When to use

- The primary restarted or compacted while work was in flight.
- A worker is orphaned, stalled, or never returned.
- The developer asks what happened to work that was running.

## When not to use

- A healthy run that is merely slow: that is `monitor-agents`.

## Inputs

- The ledger (`state_dir`, default `~/.teammate/`).
- The briefs under `<state_dir>/<project>/briefs/` and the reports under
  `<state_dir>/<project>/reports/`, or the project's `.teammate-report.md`.
- `python3 scripts/tm.py diff --cwd "<root>"` for what actually changed.
- Each task's project root and linked worker.

## Classify before acting

`tm` cannot list live subagents, so classify from the ledger and the evidence:

| Class | How you recognize it | Default action |
| --- | --- | --- |
| healthy | a report or a progressing diff exists, and no conflict | keep monitoring (`monitor-agents`) |
| orphaned | a recorded worker with no report and no matching change | decide from evidence whether to re-delegate or escalate |
| stalled | no report, no new change, past the expected run time | inspect, then re-delegate or escalate |
| returned a question | the report or last result asks a question | pause and escalate; never answer it |
| unresolved | the evidence is ambiguous | treat as unresolved; inspect or escalate, never as success |

## Never re-send blindly

Before any re-delegation, check whether the first brief took effect: read
`.teammate-report.md` with `python3 scripts/tm.py report`, check the change with
`python3 scripts/tm.py diff`, and look for the task's files. If it did any of
the work, do not send the same brief again — resume from where it is, or
escalate the partial state. Re-delegate only when you can show the original
delivery never landed.

## Procedure

1. **Rebuild from the ledger.** Memory is gone after a restart; the ledger is
   not:

   ```bash
   python3 scripts/tm.py task list
   python3 scripts/tm.py task find --worker "<name>"
   ```

   Active statuses are `planned`, `working`, `awaiting_review`, `rework`, and
   `ready_for_approval`; anything else is already closed. `task list` shows the
   open session by default, so reconcile only that session — an earlier run's
   tasks are history, not this run's orphans. If the live ledger is cluttered,
   `python3 scripts/tm.py task prune` archives closed tasks (it moves them to
   `<state_dir>/<project>/archive/`, never deletes).

2. **Read the evidence for each task.** There is no live-worker list; the report
   and the diff are what tell resume from redo:

   ```bash
   python3 scripts/tm.py report "<name>"
   python3 scripts/tm.py diff --cwd "<root>" --stat
   ```

3. **Classify each task** with the table above. Classify only after inspecting:
   a returned worker is not proof of success, and a report that asks a question
   still holds useful output.

4. **Cancel what is unsafe.** Cancel workers blocked on a decision you cannot
   make, writing outside their scope, or racing another stream (see
   `parallel-coordination`) through the harness's own control, then record the
   task `cancelled`:

   ```bash
   python3 scripts/tm.py task update "<id>" --status cancelled
   ```

5. **Re-delegate what was lost.**
   - *Still running and its task is intact:* keep it, re-establish monitoring
     with `monitor-agents`, and continue the loop.
   - *Gone, or the task lost:* mark the old task `failed`, then re-delegate it
     to a new worker (`delegate-task`). If any of its writes may already be in
     the tree, brief the new worker to reconcile the existing state rather than
     redo it, or escalate first.

6. **Re-verify recovered work.** A tree that survived an interruption has not
   been checked since it changed; run `verify-evidence` before `review-work`
   treats it as recovered.

7. **Escalate ambiguity.** When you cannot tell whether a brief was delivered, or
   what a dead worker changed, stop and ask the developer with the ledger row and
   the evidence. Duplicating work is worse than one question.

## Output

A ledger that matches the evidence on disk, with every task classified and the
action taken recorded via `python3 scripts/tm.py task update`.

## Failure and escalation

- Ambiguous recovery — escalate rather than duplicate work.
- A worker that returned a question always pauses for the developer.
- Unresolved evidence is never success; do not mark a task done to clear the
  ledger.
