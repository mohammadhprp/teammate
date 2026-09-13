# Next steps

Current state: Team Mate is a research-driven coordination layer built on the
Herdr runtime. The `src/` overlay holds the role definition, skills, scripts,
and templates. The repository does not commit to a runtime of its own.

Each phase has a verification gate. Do not start the next phase until the gate
passes.

## Phase 0 — Overlay foundation

- Create the `src/` overlay: role `AGENTS.md`, config, skills directory,
  scripts directory, templates.
- Keep the authored documentation consistent with the Herdr model.
- **Gate:** copy the overlay into a scratch repository and confirm a fresh
  session there self-identifies as Team Mate.

## Phase 1 — Validate the loop by hand

- No persistence. Use the configured `worker_kind`.
- Run delegate → wait → read → review → feedback → rework → report against a
  scratch repository.
- Record what workers actually need to be coordinated successfully.
- **Gate:** an end-to-end report is produced from real Herdr evidence.

## Phase 2 — First skills

- Write the smallest useful skills from the phase 1 evidence: `team-mate`,
  `delegate-task`, `monitor-agents`, `review-work`, `report-progress`, and
  `multi-project-context`.
- **Gate:** the loop runs from the skills alone, with no plugin and no edits to
  the existing `.agents/skills` pack.

## Phase 3 — Deterministic scripts

- Add Python scripts only for operations that proved awkward or unsafe as
  prompts. Start with `tm_collect.py`.
- Add the task ledger (`tm_state.py`, `tm_report.py`) only if persistence is
  proven necessary.
- **Gate:** scripts are idempotent, and no prompt duplicates a script.

## Phase 4 — Multi-project coordination

- Run parallel work across independent projects and Herdr workspaces.
- **Gate:** no context leaks between projects; each worker gets the correct
  project context.

## Phase 5 — Reliability

- Study cancellation, failure recovery, blocked escalation, orphaned agents,
  and restart recovery.
- **Gate:** each failure path is tested, not only designed.

## Phase 6 — Portability

- Repeat the loop with a second `worker_kind` such as codex or pi.
- **Gate:** the same skills and config work across runtimes.

## Open questions

- What is the minimum set of Team Mate skills?
- How should the overlay be distributed and updated in a project?
- How should Team Mate identify projects?
- How much state should be persistent, and where should it live?
- What should happen when the primary Team Mate session is restarted?
- How should agents coordinate dependencies?
- How should cost, latency, and agent count influence delegation?
- How portable is the model across OpenCode, Codex, Pi, and future agents?
