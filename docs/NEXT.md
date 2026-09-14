# Next steps

Current state: The skill library is complete. `src/skills/` holds 28 skills in
three layers — **common** (7, shared by the primary and workers), **teammate**
(13, primary only), and **worker** (8, run in a target project's tab). The
overlay also ships the role (`AGENTS.md`), config (`team-mate.toml`), two Python
helpers (`scripts/tm.py`, `scripts/task_store.py`), and the report and brief
templates. The original six-skill loop was validated on a real Herdr session;
the expanded library has not been exercised, and workers cannot load their
skills yet.

Each phase has a verification gate. Do not start the next phase until the gate
passes.

## Phase 0 — Distribute skills to workers (blocking)

- Chosen mechanism: `tm spawn` copies the common and worker skills from the
  primary's `.agents/skills/` into `<project>/.agents/skills/`, tracked by
  `.teammate-managed.json` and added to the project's local git exclude.
  `tm skills sync --cwd <root>` runs the same sync on demand; `worker_skills` and
  `distribute_skills` in `team-mate.toml` configure it.
- Implemented and tested at the file level: idempotent, propagates updates, and
  never overwrites a project-owned skill.
- **Gate (remaining):** spawn a worker in a scratch project and confirm it loads
  `worker-role`, `accept-assignment`, and reports through `handoff-report`
  without additional prompting.

## Phase 1 — Validate the loop end to end

- Run the full loop against a scratch repository from the skills alone:
  `team-mate` → `plan-work` → `task-ledger` → `delegate-task` →
  `monitor-agents` → `review-work` → `run-rework` → `report-progress`.
- Run the worker path too: `accept-assignment` → `implement-task` →
  `verify-change` → `report-result`.
- Record where the skills are wrong, missing, or too verbose.
- **Gate:** a developer report produced from real Herdr evidence, with the
  worker completing from the skills alone.

## Phase 2 — Independent review, rework, and recovery

- Exercise `independent-review`, `run-rework`, `escalate-decision`, and
  `recover-run` against real failures: a failing review, a blocked worker, a
  primary restart.
- Confirm `review_policy = "always"` reviews every settled task, that a separate
  reviewer is added only when the change warrants it, and that a restart neither
  duplicates work nor flags an unledgered reviewer as drift.
- **Gate:** each path runs; a fail converges or escalates; recovery reconciles
  the ledger without re-sending a delivered prompt.

## Phase 3 — Deterministic scripts, only where proven

- Add a script only for an operation that proved awkward or unsafe as a prompt
  (status collection, log collection, and report assembly are likely
  candidates). Keep `scripts/tm.py` the single CLI and do not duplicate it in
  prompts.
- Fix the known gaps: `tm.py`'s `--state-dir` help text (it says `.teammate`; the
  real default is `~/.teammate`) and `task show` not rendering `--note`.
- Add `templates/worker-report.md` only if `report-result` needs it; today the
  contract is carried by `handoff-report`.
- **Gate:** scripts are idempotent, and no prompt restates a script.

## Phase 4 — Multi-project coordination

- Run parallel work across independent projects and Herdr workspaces.
- Validate `parallel-coordination` (merge order, and no parallel writers on the
  same files) and context isolation.
- **Gate:** no context leaks between projects; each worker gets the correct
  project context.

## Phase 5 — Reliability

- Test cancellation, failure recovery, blocked escalation, orphaned agents, and
  restart recovery — the paths the skills describe but no run has exercised.
- **Gate:** each failure path is tested, not only designed.

## Phase 6 — Portability

- Repeat the loop with a second `worker_kind` such as codex or pi.
- **Gate:** the same skills and config work across runtimes.

## Known gaps

- Worker skill distribution is unresolved (Phase 0 blocks a whole layer).
- The library is larger than the validated set; trim skills no real run uses.
- No skill has run against live Herdr since the expansion — the current
  verification is static review only.
- Reviewer workers are intentionally unledgered; `task-ledger` documents this
  for `recover-run`.

## Open questions

- Which distribution mechanism keeps workers current without drift?
- How should Team Mate identify projects beyond a name-to-root mapping?
- What is the minimum useful skill set once a real run tests the library?
- How much state should persist, and what should happen on restart?
- How should dependencies between agents be coordinated?
- How should cost, latency, and agent count influence delegation?
- How portable is the model across OpenCode, Codex, Pi, and future agents?
