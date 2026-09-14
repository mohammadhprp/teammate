---
name: recover-run
description: "Reconcile the task ledger against live workers after a primary restart and recover unhealthy agents: classify each task as orphaned, stuck, blocked, or `unknown`, cancel what is unsafe, resume or re-delegate what was lost, and never resend a prompt that may already have been delivered. Use when the primary session restarted or compacted mid-run, when a worker is missing from the live worker list, stalled, or `unknown`, or when the developer asks what happened to work that was running."
---

# Recover a run

A run breaks in two ways: the primary's context is lost (restart or compaction)
while workers keep running, or a worker stops making progress. The ledger
survives the primary; the live worker list shows what is actually alive. Recovery
is reconciling the two without doing work twice.

The dangerous mistake is re-sending a brief whose first delivery may already
have taken effect. A worker that received it may already have edited files, and
a resend duplicates that work. When delivery cannot be ruled out, escalate: a
question is cheaper than a duplicated change.

## When to use

- The primary restarted or compacted while work was in flight.
- A worker is orphaned, stuck, `blocked`, or `unknown`.
- The developer asks what happened to work that was running.

## When not to use

- A healthy run that is merely slow: that is `monitor-agents`.

## Inputs

- The ledger (`state_dir`, default `~/.teammate/`).
- Live worker state from `python3 scripts/tm.py status`.
- The timeouts you set when delegating — they define what counts as stuck.
- Each task's project root, worker, and brief.

## Classify before acting

Reconcile one row per task: the ledger's `worker` and status fields against the
live agent list. Then classify:

| Class | How you recognize it | Default action |
| --- | --- | --- |
| healthy | live, and state or output shows progress | keep monitoring (`monitor-agents`) |
| orphaned | in the ledger, absent from the live agent list (`error: no agent named <name>`) | decide from evidence whether to re-delegate or escalate |
| stuck | `working` past its timeout with no new output | inspect, then cancel or escalate |
| blocked | Herdr reports a dialog waiting on input | pause and escalate the question; never answer it |
| unknown | present but unclassified | treat as unresolved; inspect or escalate, never as success |

## Never re-send blindly

Before any resend, check whether the first brief took effect: read the worker's
output and change with `python3 scripts/tm.py report` and
`python3 scripts/tm.py diff`, and look for the task's files. If it did any of the
work, do not send the same brief again — resume the worker from where it is, or
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
   `ready_for_approval`; anything else is already closed.

2. **List live agents** and pair each with its ledger task:

   ```bash
   python3 scripts/tm.py status
   ```

   A recorded worker with no live agent is orphaned.

3. **Classify each task** with the table above. Classify only after inspecting:
   `idle` is not proof of success, and a `blocked` worker may hold useful output.

4. **Inspect before deciding.** For a live worker, read its state and its change —
   this is what tells resume from redo:

   ```bash
   python3 scripts/tm.py report "<name>" --lines 300
   python3 scripts/tm.py diff --cwd "<root>" --stat
   ```

5. **Cancel what is unsafe.** Stop workers blocked on a decision you cannot make,
   writing outside their scope, or racing another stream (see
   `parallel-coordination`), and record the task `cancelled`:

   ```bash
   python3 scripts/tm.py stop "<name>"
   python3 scripts/tm.py task update "<id>" --status cancelled
   ```

   Add `--keep-tab` when you need the worker's output before the tab closes.

6. **Resume or re-delegate what was lost.**
   - *Alive and its task is intact:* keep it, re-establish monitoring with
     `monitor-agents`, and continue the loop.
   - *Gone, or the task lost:* mark the old task `failed`, then re-delegate it
     to a new worker (`delegate-task`). If any of its writes may already be in
     the tree, brief the new worker to reconcile the existing state rather than
     redo it, or escalate first.

7. **Re-verify recovered work.** A tree that survived an interruption has not
   been checked since it changed; run `verify-evidence` before `review-work`
   treats it as settled.

8. **Escalate ambiguity.** When you cannot tell whether a brief was delivered, or
   what a dead worker changed, stop and ask the developer with the ledger row and
   the evidence. Duplicating work is worse than one question.

## Output

A ledger and live-agent view that agree, with every task classified and the
action taken recorded via `python3 scripts/tm.py task update`.

## Failure and escalation

- Ambiguous recovery — escalate rather than duplicate work.
- `blocked` always pauses for the developer.
- `unknown` is unresolved and never success; do not mark it done to clear the
  ledger.
