---
name: parallel-coordination
description: "Run several independent worker streams at once without corrupting shared state: check `max_concurrent`, spawn without `--wait`, poll worker state, fix a merge order before starting, keep parallel writers off the same files, and land results in the primary. Use whenever more than one worker will run at the same time, when the developer says to run things in parallel or 'have two agents look at it', or when deciding whether two work streams are independent enough to overlap."
---

# Parallel coordination

Running workers at the same time is only safe when their write sets do not
collide. Parallelism buys wall-clock time, but it costs coordination, so use it
for genuinely independent streams and serialize everything else.

Workers run in their own tabs, never see each other's changes, and cannot merge.
The primary stays the single point of coordination and does the assembling.

## When to use

- The plan has more than one worker that should run at once.
- The developer asks to run work in parallel ("in parallel", "at the same time",
  "have two agents look at it").
- Deciding whether two work streams are independent enough to overlap.

## When not to use

- The streams share files, a branch, or an ordering dependency: they are not
  independent, so run them serially — one worker at a time, waiting via
  `python3 scripts/tm.py wait` / `status` (or a backgrounded wait), not a flag —
  or give one stream sole ownership of the shared area.
- There is only one stream: plain `delegate-task` is simpler, and a parallel
  wrapper adds coordination without saving time.

## Inputs

- The plan (`plan-work`): the streams, their roles, and their intended
  independence.
- Each stream's project root (`multi-project-context`).
- `max_concurrent` and `max_iterations` from `team-mate.toml` (task override >
  project > primary).
- A ledger task per stream (`task-ledger`).

## Check independence first

Map each stream to the files and shared state it writes. Two streams may run
together only when their write sets are disjoint and neither consumes the
other's output; otherwise one worker's edit silently overwrites or invalidates
the other's, and no worker can see it happen. Shared state includes the same
file, the same branch, the same task or store, and the same external service.

When overlap is unavoidable, decide the conflict-resolution strategy *before*
spawning: a single owner for the shared area, or a declared merge order with one
integrator. Without one, run the streams serially.

## Respect `max_concurrent`

`max_concurrent` caps live workers. Count what is already running with
`python3 scripts/tm.py status` before adding a stream, and start only the number
that fits; queue the rest and
start them as slots free. A cap exists so the primary can still supervise every
worker it owns — more live workers than that and supervision degrades into
guessing.

## Fix the merge order before results arrive

Decide the order in which streams land before any of them finishes. The order
determines who reconciles against whom and which stream must re-verify, and it
keeps a restarted primary (`recover-run`) continuing the same sequence instead
of inventing a new one. Record it with
`python3 scripts/tm.py task update <id> --note "<order>"`, or state it plainly
in the report.

## Procedure

1. **Confirm independence** for every pair of streams (see above). If a pair is
   not independent, serialize it or assign ownership before continuing.
2. **Count live workers** and reduce the batch to the `max_concurrent` budget:

   ```bash
   python3 scripts/tm.py status
   ```

3. **Record each stream** as its own task before spawning (`task-ledger`), so a
   lost primary can still reconstruct the batch.
4. **Spawn and dispatch without blocking.** Submit every brief, then poll:

   ```bash
   python3 scripts/tm.py spawn --cwd "<root>" --project "<project>" --name "<name>" --task "<id>"
   python3 scripts/tm.py send "<name>" --brief "<brief-file>"
   ```

   Omit `--wait`: it blocks the primary on that one worker and turns the batch
   back into serial work. Never use a long foreground `--wait` — even for a
   single worker; if you need a completion, background the wait or poll `tm
   status` (`monitor-agents`).
5. **Poll the batch.**

   ```bash
   python3 scripts/tm.py status
   python3 scripts/tm.py wait "<name>" --timeout <ms>
   ```

   Polling the batch is the cheap check; waiting blocks only on a named worker.
   Settle states, blockers, and stuck detection belong to
   `monitor-agents`; a worker that is gone belongs to `recover-run`.
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
  owns): stop the newer stream with `python3 scripts/tm.py stop <name>` (add
  `--keep-tab` if you need its output) and escalate, rather than let both write.
- **Merge conflict in the primary:** stop, preserve both working trees, and
  escalate. Do not pick a side by guessing which change the developer wanted.
- **A stream blocked on a decision:** pause that stream only; do not answer its
  dialog on its behalf.
