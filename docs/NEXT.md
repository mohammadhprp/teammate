# Next steps

Current state: The skill library is complete — 28 skills in `src/skills/` across
common (7), teammate (13), and worker (8) — plus `scripts/tm.py`,
`scripts/task_store.py`, the templates, and a 23-test suite. Skill distribution
to target projects works, and the loop has run on live Herdr sessions with both
opencode and `omp`. What follows is what is left.

Each phase has a verification gate. A phase is done only when its gate passes on
a real run.

## Phase 2 — Independent review, rework, recovery (remaining)

- Exercised live: a failed review → `run-rework` sends only the open finding →
  the worker fixes it → re-review passes.
- Remaining: a blocked worker's escalation, and a primary restart mid-run.
- **Gate:** fail → rework → pass converges or escalates; recovery reconciles the
  ledger without re-sending a delivered prompt.

## Phase 5 — Reliability (remaining)

- Exercised live: an orphaned worker (`status` errors, its task still `working`)
  is detected and reconciled to `failed`.
- Remaining: a `blocked` worker, a mid-run primary restart, and cancelling a
  still-running worker.
- **Gate:** each failure path is tested, not only designed.

## Phase 6 — Portability (remaining)

- Exercised live: `omp` discovered and read the same distributed skills and
  completed the same task.
- Remaining: without `herdr integration install omp`, `send --wait` returns
  `unconfirmed`; install the integration (or keep polling `status`, as
  `monitor-agents` already says).
- **Gate:** the same skills and config work across runtimes without
  special-casing.

## Known gaps

- Blocked escalation and a mid-run primary restart are not yet exercised
  (Phase 2/5).
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
