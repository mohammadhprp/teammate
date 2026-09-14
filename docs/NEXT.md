# Next steps

Current state: The skill library is complete — 28 skills in `src/skills/` across
common (7), teammate (13), and worker (8) — plus `scripts/tm.py`,
`scripts/task_store.py`, the templates, and a 23-test suite. Skill distribution
to target projects works. The loop has run live on opencode and `omp` (whose
Herdr integration is now installed, so `send --wait` is reliable): delegate →
build → verify → report, fail → rework → pass, parallel projects, cancellation,
and orphan reconciliation all pass. What follows is what is left.

Each item has a verification gate. It is done only when the gate passes on a
real run.

## Blocked-worker escalation (Phase 2/5)

- A worker that hits a Herdr approval or question dialog must pause the primary
  and reach the developer as one clear question.
- Not yet induced: a worker asked in text reports `idle`, not `blocked`; the
  state needs a real permission dialog. Reproduce one and confirm the primary
  detects it.
- **Gate:** the primary reads the dialog and escalates without answering it
  itself.

## Mid-run primary restart (Phase 2/5)

- Ledger reconstruction is validated: a fresh process lists the active task and
  `task find --worker` resolves it.
- Not yet done: an actual mid-run kill of the primary process, then
  `recover-run` resuming or re-delegating what was lost.
- **Gate:** recovery reconciles the ledger and never re-sends a prompt that may
  already have been delivered.

## Known gaps

- Blocked detection and a true mid-run kill are the only reliability paths not
  yet exercised.
- `tm diff` lists an untracked file but not its contents; the reviewer reads it.
- The library is larger than the validated set; trim skills no run uses.
- Reviewer workers are intentionally unledgered; `task-ledger` documents this
  for `recover-run`.

## Open questions

- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Should a worker kind's Herdr integration be installed by default for reliable
  lifecycle states?
