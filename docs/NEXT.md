# Next steps

Current state: The skill library is complete — 28 skills in `src/skills/` across
common (7), teammate (13), and worker (8). The overlay ships the role, config,
`scripts/tm.py`, `scripts/task_store.py`, templates, and a test suite
(`scripts/tests/`, 23 tests). Skill distribution to target projects is
implemented, and the loop has now been exercised on live Herdr sessions with two
worker kinds (opencode and omp).

Each phase has a verification gate. A phase is done only when its gate passes on
a real run.

## Phase 0 — Distribute skills to workers (blocking) — done

- `tm spawn` copies the configured `worker_skills` into
  `<project>/.agents/skills/`, tracked by `.teammate-managed.json` and added to
  the project's local git exclude. `tm skills sync` runs the same sync on demand.
- **Gate: passed.** A spawned opencode worker discovered the distributed skills,
  created the file, verified it with real commands, and reported in the
  `handoff-report` shape without extra prompting.

## Phase 1 — Validate the loop end to end — done

- Ran delegate → worker → monitor → review → verdict → report against a scratch
  repository from the skills alone.
- **Gate: passed.** A developer report produced from real Herdr evidence, with
  the worker completing from the skills alone.

## Phase 2 — Independent review, rework, recovery — partial

- Validated live: a failed review (a missed criterion) → `run-rework` sends only
  the open finding → the worker fixes it → re-review passes.
- Still to exercise: a blocked worker's escalation, and a primary restart
  mid-run.
- **Gate: partial.** Fail → rework → pass converges; blocked and mid-run restart
  remain.

## Phase 3 — Deterministic scripts, only where proven — done

- Live runs proved three `tm.py` fixes: `tm diff` now surfaces untracked files,
  `--state-dir` help shows the real `~/.teammate` default, and `task show`
  renders `--note`.
- Added `scripts/tests/` (23 tests). No new script was needed beyond `tm.py`.
- **Gate: passed.** Scripts are tested and idempotent; no prompt restates one.

## Phase 4 — Multi-project coordination — done

- Two workers ran concurrently in independent projects, each in its own Herdr
  workspace.
- **Gate: passed.** No context leak; each worker got the right project; results
  were produced side by side.

## Phase 5 — Reliability — partial

- Validated live: an orphaned worker (`status` errors, its task still `working`)
  is detected and reconciled to `failed`.
- Still to exercise: a `blocked` worker, a mid-run primary restart, and
  cancelling a still-running worker.
- **Gate: partial.** The paths are designed and orphans are tested; blocked and
  restart are not.

## Phase 6 — Portability — partial

- Validated live: `omp` discovered and read the same distributed skills and
  completed the same task.
- Caveat: without `herdr integration install omp`, `send --wait` returns
  `unconfirmed`; poll with `status`, as `monitor-agents` already says.
- **Gate: partial.** The same skills and config run on a second kind; reliable
  lifecycle classification needs the integration.

## Known gaps

- Blocked escalation and a mid-run primary restart are not yet exercised
  (Phase 2/5).
- `tm diff` lists an untracked file but not its contents; the reviewer reads it.
- The library is larger than the validated set; trim skills no run uses.
- Reviewer workers are intentionally unledgered; `task-ledger` documents this
  for `recover-run`.

## Open questions

- Which distribution mechanism keeps workers current without drift? (chosen:
  sync into the project on spawn)
- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once more runs test the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- Should a worker kind's Herdr integration be installed by default for reliable
  lifecycle states?
