---
name: compact-context
description: "Keep the primary's context small by treating the ledger as off-context memory: checkpoint a compact resume packet with `tm session checkpoint`, ask the developer to compact the harness session, then reload with `tm session resume` and reconcile with `recover-run`; read raw briefs, reports, and diffs on demand with `tm report` / `tm diff`, never wholesale. Use at a safe boundary (a worker just settled, before the developer sees a report), before a large read, or whenever the developer asks to compact or reduce context."
---

# Compact context

The ledger is the primary's off-context memory. Verbose artifacts — briefs,
worker reports, and diffs — already live under `state_dir` (default
`~/.teammate/`), so they never need to sit in the context window. When the
window fills, the primary loses the thread, not the work: everything needed to
resume is on disk. This skill moves context *out* of the window deliberately,
before a harness compaction forces it.

The trigger is **boundaries plus explicit**, not a token threshold. Team Mate
cannot measure the context window, and a guessed threshold fires at the wrong
moment. Checkpoint where the state is already settled, or when the developer
asks.

## The rule

- **Raw artifacts stay in the ledger and are read on demand.** Never carry a
  whole brief, report, or diff in context: `tm report <name>` reads a worker's
  report, `tm diff --cwd <root>` shows the change, and `tm brief` wrote the
  brief that the harness subagent call already used. Pull one in only when the
  current step needs it, and drop it once used.
- **A checkpoint carries the *state*, not the *evidence*.** The packet holds the
  goal, the open tasks, the plan, the decisions, and the next action — a few
  lines a fresh context can reload in one read. The evidence stays behind the
  `tm report` / `tm diff` commands.
- **Checkpoint at boundaries, not continuously.** The packet is a resume point,
  not a log; it is overwritten each time.

## When to use

- **A worker just settled** (its report is in hand): record the outcome in the
  ledger, then checkpoint before starting the review.
- **Before the developer sees a report:** the report itself is on disk; the
  checkpoint is what lets a compacted primary still answer for it.
- **Before a large read** — a big file, a long diff, a broad search: checkpoint
  first, so the context spent on the read is recoverable.
- **On explicit request:** the developer asks to compact, reduce context, or
  "checkpoint this".

## When not to use

- Mid-step, with nothing settled — there is no boundary to record, and a
  checkpoint would only capture a half-state.
- A short task that will finish in the current window: a checkpoint adds a write
  and a read for no gain.

## Inputs

- The open session (`python3 scripts/tm.py session status`) and the project.
- The ledger state to carry: open tasks, the goal, the plan, decisions, notes.
- The harness's own compaction command — `/compact` in opencode — which only
  the developer can run.

## Procedure

1. **Checkpoint.** Write the compact packet for the open session, passing the
   free text the ledger cannot derive:

   ```bash
   python3 scripts/tm.py session checkpoint --project <name> \
     --goal "<the run's goal>" --next "<the next action>" \
     --plan "<a step>" --decision "<a decision>" --note "<a note>"
   ```

   `--plan`, `--decision`, and `--note` are repeatable. Project, session,
   timestamp, and the session's open tasks are derived from the ledger; a second
   checkpoint overwrites the first. The command prints the packet path.

2. **Ask the developer to compact the harness session.** Compaction is the
   harness's, not Team Mate's — in opencode the developer runs `/compact`. Say
   what was checkpointed and what will be reloaded; do not compact on their
   behalf or claim to have done it.

3. **Resume after compaction.** Reload the packet in one read:

   ```bash
   python3 scripts/tm.py session resume --project <name>
   ```

   `--session` selects a session (default: current); a missing packet fails with
   the command that creates one. Then reconcile the reloaded state against the
   ledger with `recover-run` — a compaction is a context loss, so the same
   classify-before-acting discipline applies, and a worker that was running is
   not proof it returned.

4. **Read evidence only when a step needs it.** Fetch a specific report or diff
   with `tm report` / `tm diff`, use it, and do not paste it back into the
   running summary.

## Output

A compact resume packet under `<state_dir>/<project>/checkpoint.json`, and,
after compaction, a primary whose working state was restored in one read with
the raw evidence still in the ledger.

## Failure and escalation

- **No open session:** `session checkpoint` fails and names `tm session start`.
  Start the session the run should have opened first; do not checkpoint against
  a guessed id.
- **A stale packet:** `session resume` refuses a packet whose session does not
  match the one requested (or the open session) and names the command that reads
  the packet's own session. Re-checkpoint if the run has moved on.
- **Compaction is not yours to run:** always ask the developer. A compaction
  that happens without a checkpoint loses context with no resume point.
- **A session ending leaves the packet in place.** It is the project's latest
  resume point and the next checkpoint overwrites it, so `recover-run` can still
  reconcile after the run closes.

## Related skills

- `task-ledger` owns the durable records the packet derives from and points at.
- `recover-run` reconciles the ledger after the compaction this skill prepares
  for.
- `monitor-agents` produces the worker return that the checkpoint boundary
  records.
