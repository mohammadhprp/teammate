---
name: monitor-agents
description: "Track each worker subagent until it returns and collect its evidence: a foreground subagent call returns its result, a background one notifies on completion, so there is no polling — read `.teammate-report.md` with `tm report` and record the settle. Use after delegating work and before reviewing it, or whenever a worker seems stalled or the developer asks what an agent is doing; a lost or orphaned worker is `recover-run`'s."
---

# Monitor agents

A native subagent has no runtime state to poll: a foreground call returns its
result, and a background call notifies the session when it completes. Tracking a
worker means waiting for that return, then reading the evidence it left behind.

## When to use

- After delegating a task, to wait for the worker.
- When the developer asks what a worker is doing, or a worker seems stalled.

## When not to use

- Once a worker has returned and you already have its report: move to
  `review-work`.

## How a subagent settles

| Outcome | Meaning |
| --- | --- |
| returned | The subagent tool call completed. **Ready, not correct.** |
| returned a question | The worker is blocked on a decision; escalate. |
| errored | The call failed; inspect, then re-delegate or escalate. |
| no completion | A background subagent that never notifies, or an abandoned foreground call. Unresolved. |

There is no `working`/`idle`/`done`/`blocked`/`unknown` state to poll: the
harness reports completion by returning or notifying, and the worker's own
`.teammate-report.md` is the evidence. A returned subagent is ready for review,
not proof of success.

## Wait without going silent

A long foreground call blocks the primary and leaves the developer without a
point of contact, which defeats the reason Team Mate stays free. A worker run is
minutes to tens of minutes, so never sit inside one.

- **Let the harness wait.** A foreground subagent call returns when the worker
  finishes; a background subagent notifies the session on completion. Prefer
  the background path for anything but a quick task — do not poll.
- **Stay available.** While a background worker runs, keep working on other
  coordination; the session is notified when it finishes.
- **Report a long run once.** Staying free is not the same as staying silent.
  When a worker has run longer than about 15 minutes without returning, emit one
  interim, developer-visible status — worker name, what it is doing, and elapsed
  time. A long build that reports nothing until review is a process failure.

## Procedure

1. **Wait for the return.** The subagent tool call returns the worker's result
   (foreground), or the session is notified when a background subagent
   completes. Do not poll for a state that does not exist.

2. **Read the report.**

   ```bash
   python3 scripts/tm.py report "<name>"
   ```

   That reads `.teammate-report.md` from the project root. If it is missing, the
   worker did not finish its report — treat that as unresolved, not a pass.

3. **Record the settle.**

   ```bash
   python3 scripts/tm.py task update "<id>" --status awaiting_review
   ```

4. **Handle a returned question.** A worker that returns a question instead of a
   result is blocked. Carry the question to the developer with
   `escalate-decision`; do not answer it for the worker.

5. **Detect stuck or inactive.** A background worker that never notifies, or a
   foreground call that errored, is unresolved: inspect with `tm report` and
   `tm diff`, then escalate or re-delegate (`recover-run`). Do not resend a
   brief that may already have landed.

6. **Cancel.** A worker that must stop is cancelled through the harness's own
   control (for example codex `close_agent`); `tm` does not manage it.

7. **Confirm nothing stray is left.** Before treating the work as ready for
   approval, check the report's recorded PIDs and ports and confirm no listener
   the worker started is still running. A live server from a finished task is an
   open finding, not harmless residue: stop it or escalate before review.

## Output

The worker's returned result, its `.teammate-report.md`, and any blocker text.

## Failure

A missing report, a failed call, unexpected scope changes, and lost workers all
escalate. Never treat a returned subagent or a missing report as completion.
