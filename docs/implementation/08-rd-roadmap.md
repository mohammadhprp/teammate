# R&D roadmap

The repository should evolve through experiments rather than a large upfront
implementation.

## Phase 1 — Validate the operating model

- Run Team Mate manually through OpenCode, Codex, and Pi where practical.
- Use Herdr to create multiple agents.
- Test implementation, review, debugging, and investigation workflows.
- Record what agents actually need to coordinate successfully.

## Phase 2 — Build the shared skill library

- Establish a consistent skill format.
- Add delegation and monitoring skills.
- Add review and reporting skills.
- Add small deterministic scripts only where they provide clear value.

## Phase 3 — Multi-project coordination

- Validate project discovery.
- Validate `AGENTS.md` and `CONTEXT.md` loading.
- Test isolation between projects.
- Test parallel work across unrelated repositories.

## Phase 4 — Reliability

- Study failure recovery.
- Add bounded retries and escalation.
- Study persistence and orphaned-agent recovery.
- Define cancellation behavior.

## Phase 5 — Developer experience

- Improve progress reporting.
- Improve final reports.
- Make useful logs easy to inspect.
- Reduce unnecessary developer interruptions.

## Phase 6 — Architecture decisions

Only after the previous experiments should the project decide whether it needs
additional runtime infrastructure, persistent services, a dedicated CLI, or
other application components.

## Open questions

- What is the minimum set of Team Mate skills?
- How should skills be distributed to projects?
- How should Team Mate identify projects?
- How much state should be persistent?
- What should happen when Team Mate itself is restarted?
- How should agents coordinate dependencies?
- How should cost, latency, and agent count influence delegation?
- How portable is the model across OpenCode, Codex, Pi, and future agents?
