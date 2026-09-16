---
name: monitor-agents
description: "Track worker lifecycle and collect evidence until it settles: interpret idle/done/working/blocked/unknown and cancel safely, without blocking the primary — poll `status` or background a wait, never a long foreground `--wait`. Use after delegating work and before reviewing it, or whenever a worker seems stalled or the developer asks what an agent is doing; stuck and orphaned workers are `recover-run`'s."
---

# Monitor agents

Track each worker until it settles, and collect the state needed to review it.
Use the `tm` CLI; it prints one line per check.

## When to use

- After delegating a task, to wait for the worker.
- When the developer asks what a worker is doing, or a worker seems stalled.

## When not to use

- Once a worker has settled and you already have its report: move to
  `review-work`.

## States

| State | Meaning |
| --- | --- |
| `working` | The agent is active. |
| `idle` / `done` | Ready for input. **Not proof of success.** |
| `blocked` | Herdr recognized an approval or question dialog waiting on input. |
| `unknown` | Present but unclassified. **Unresolved, never success.** |

## Agents without an integration

Herdr classifies an agent from screen detection plus an optional integration.
When a worker kind has no integration installed (`herdr integration status`),
Herdr may report `idle` while the agent is actually working, so `wait` can
return too early.

- Install it when practical: `herdr integration install <kind>`.
- Otherwise do not trust `idle` alone. Confirm completion from evidence —
  `python3 scripts/tm.py diff`, the project's tests, `python3 scripts/tm.py
  report` — as `verify-evidence` requires.

## Wait without going silent

A long wait blocks the primary and leaves the developer without a point of
contact, which defeats the reason Team Mate stays free. A worker run is minutes
to tens of minutes, so never sit inside it.

- **Deliver, then poll.** `tm send` without `--wait` returns as soon as the
  brief is delivered; check `tm status` (non-blocking) between other work.
- **Background a real wait.** When you need the completion, run it in a
  background shell and keep working; the session is notified when it finishes.
  In OpenCode, the shell tool's `background` flag does this; from the TUI,
  ctrl+b backgrounds a running foreground command.
- **Do not foreground a long `--wait`.** `tm send --wait` and `tm wait` hold the
  whole turn. Keep a foreground wait short (a small `--timeout`) and re-check
  rather than blocking for the full run.

If a foreground command does hang the primary, the developer can press ctrl+b in
the primary's tab to move it to the background — an escape hatch, not the
design.

## Procedure

1. **Wait for settle (serial).**

   ```bash
   python3 scripts/tm.py wait "<name>" --timeout <ms>
   ```

   Output: `<name> <state>`. Or rely on `python3 scripts/tm.py send --wait` from
   `delegate-task`.

2. **Poll (parallel).**

   ```bash
   python3 scripts/tm.py status          # all workers
   python3 scripts/tm.py status "<name>" # one worker
   ```

   A worker has settled when it is `idle`, `done`, or `blocked`.

3. **Collect the report.**

   ```bash
   python3 scripts/tm.py report "<name>" --lines 300
   ```

   Use a generous `--lines`; too few truncates the final report. Record the
   settle with `python3 scripts/tm.py task update <id> --status awaiting_review`.

4. **Handle `blocked`.** Read the dialog, then escalate to the developer with
   the question. Do not answer it for the worker.

   ```bash
   python3 scripts/tm.py report "<name>" --source visible --lines 80
   ```

5. **Detect stuck or inactive.** If the worker stays `working` past the timeout
   you set when waiting, with no new output, treat it as stuck and escalate. Do
   not resend a prompt that may already be delivered.

6. **Cancel.**

   ```bash
   python3 scripts/tm.py stop "<name>"
   ```

   Interrupts the worker and closes its tab. Use `--keep-tab` to keep the tab.

7. **Orphans.** A worker recorded for a task but absent from
   `python3 scripts/tm.py status` is orphaned; `python3 scripts/tm.py status
   <name>` fails with an `error:` line (for example `error: no agent named
   <name>`). Reconcile it with `recover-run` rather than failing the task
   blindly.

8. **Confirm nothing stray is left.** Before treating the work as ready for
   approval, check the report's recorded PIDs and ports and confirm no listener
   the worker started is still running. A live server from a finished task is an
   open finding, not harmless residue: stop it or escalate before review.

## Output

Settled state, the worker's report, and any blocker text.

## Failure

Timeouts, repeated errors, unexpected scope changes, and lost workers all
escalate. Never treat `unknown` or inactivity as completion.
