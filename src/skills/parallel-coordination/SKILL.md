---
name: parallel-coordination
description: "Run several independent worker streams at once without corrupting shared state: check `max_concurrent`, start background subagents through the harness, fix a merge order before starting, keep parallel writers off the same files, and land results in the primary. Use whenever more than one worker will run at the same time, when the developer says to run things in parallel or 'have two agents look at it', or when deciding whether two work streams are independent enough to overlap."
---

# Parallel coordination

Running workers at the same time is only safe when their write sets do not
collide. Parallelism buys wall-clock time, but it costs coordination, so use it
for genuinely independent streams and serialize everything else.

Each worker is a native subagent in its own call, never sees another's changes,
and cannot merge. The primary stays the single point of coordination and does
the assembling.

## When to use

- The plan has more than one worker that should run at once.
- The developer asks to run work in parallel ("in parallel", "at the same time",
  "have two agents look at it").
- Deciding whether two work streams are independent enough to overlap.

## When not to use

- The streams share files, a branch, shared resources (a port, a browser
  session), or an ordering dependency: they are not independent, so run them
  serially — one worker at a time, letting the first return before starting the
  next — or give one stream sole ownership of the shared area.
- There is only one stream: plain `delegate-task` is simpler, and a parallel
  wrapper adds coordination without saving time.

## Inputs

- The plan (`plan-work`): the streams, their roles, and their intended
  independence.
- Each stream's project root (`multi-project-context`).
- `max_concurrent` and `max_iterations` from the loaded `team-mate.toml`
  (task-level flags override the single loaded file).
- A ledger task per stream (`task-ledger`).
- The resolved harness (`tm harness`): whether it supports background subagents.

## Check independence first

Map each stream to the files and shared state it writes. Two streams may run
together only when their write sets are disjoint and neither consumes the
other's output; otherwise one worker's edit silently overwrites or invalidates
the other's, and no worker can see it happen. Shared state includes the same
file, the same branch, the same task or store, the same external service, the
same **port**, and the same **browser session or profile**.

Shared resources collide the same way files do: two UI streams that both listen
on `:8081`, or both drive `agent-browser` without a session, fight over one
shared browser tab — one logs a hijacked tab while the other renders the wrong
page. Check ports and browser sessions in the same pass as the file write-set,
before starting, not after a collision. Give each UI stream its own port from a
small convention (`:8080`, `:8081`, ... one per stream) and its own
`agent-browser --session <stream>`; no two streams share a port or a browser
session.

When overlap is unavoidable, decide the conflict-resolution strategy *before*
starting: a single owner for the shared area, or a declared merge order with one
integrator. Without one, run the streams serially.

## Respect `max_concurrent`

`max_concurrent` caps concurrent workers. Count the workers you already have
running before adding a stream — the harness notifies as each background
subagent finishes, so you know when a slot frees — and start only the number
that fits; queue the rest and start them as slots free. A cap exists so the
primary can still supervise every worker it owns — more concurrent workers than
that and supervision degrades into guessing.

## Fix the merge order before results arrive

Decide the order in which streams land before any of them finishes. The order
determines who reconciles against whom and which stream must re-verify, and it
keeps a restarted primary (`recover-run`) continuing the same sequence instead
of inventing a new one. Record it with
`python3 scripts/tm.py task update <id> --note "<order>"`, or state it plainly
in the report.

## Procedure

1. **Confirm independence** for every pair of streams (see above) — write set,
   shared state, and shared resources. For UI streams, assign each its own port
   and its own `agent-browser --session <stream>` before continuing. If a pair
   is not independent, serialize it or assign ownership before continuing.
2. **Count running workers** and reduce the batch to the `max_concurrent`
   budget. There is no live-worker list to query — count the background
   subagents you started and have not yet seen complete.
3. **Record each stream** as its own task before dispatching (`task-ledger`), so
   a lost primary can still reconstruct the batch.
4. **Start every stream as a background subagent.** Persist each brief, call the
   harness's subagent tool with it, and link the worker:

   ```bash
   python3 scripts/tm.py brief "<name>" --task "<id>" <<'EOF'
   <brief>
   EOF
   # call the harness subagent tool with the brief; background where supported
   python3 scripts/tm.py task update "<id>" --worker "<name>" --status working
   ```

   Start all of them, then let the harness notify you as each completes — do not
   block on the first, which turns the batch back into serial work. Where the
   harness cannot background (`pi` depends on the extension), run the streams
   serially instead, letting each return before starting the next.
5. **Await completion.** A background subagent notifies when it finishes; a
   foreground one returns. Then read each report with `tm report`. A worker that
   never returns belongs to `recover-run`; a worker that returns a question
   belongs to `escalate-decision`.
6. **Land results in the primary, one stream at a time.** A worker leaves its
   change in its own working tree; it cannot see, reconcile, or merge another
   stream's. After each stream lands, run the project's checks on the *combined*
   tree (`verify-evidence`) — a per-stream green run proved only that stream's
   tree, not the union. Never let two workers write the same tree to merge.
7. **Re-verify the combined result** against the acceptance criteria with
   `review-change`, routed through `review-work`.
8. **Record and report** each stream's outcome with
   `python3 scripts/tm.py task update`, then `report-progress`.

## Output

The combined results, the merge order used, and a note of any conflict or
overlap encountered.

## Failure and escalation

- **Overlap discovered mid-run** (a stream turns out to touch a file another
  owns): cancel the newer stream through the harness and escalate, rather than
  let both write.
- **Merge conflict in the primary:** stop, preserve both working trees, and
  escalate. Do not pick a side by guessing which change the developer wanted.
- **A stream that returns a question:** pause that stream only; do not answer
  its question on its behalf.
