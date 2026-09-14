# Context

Repository-specific guidance for working in Team Mate.

## Repository

Team Mate is a research and tooling project for building a reusable operating
model for a primary AI engineering agent.

The primary agent can run in a coding-agent environment such as OpenCode, Codex,
or Pi. It uses Herdr as the current agent orchestration runtime and can create
and manage multiple agents across multiple software projects.

The repository focuses on shared skills, scripts, workflows, agent instructions,
conventions, and research.

## Project model

A Team Mate session can work across multiple projects.

Each target project can provide its own:

- `AGENTS.md`
- `CONTEXT.md`
- skills
- scripts
- project documentation
- project-specific conventions

Agents should load and respect the target project's context in addition to the
shared Team Mate capabilities.

## Key files

- `README.md` — project overview.
- `docs/VISION.md` — product vision and operating model.
- `docs/implementation/` — long-term R&D, architecture, experiments, and
  decisions.
- `docs/NEXT.md` — what to build next.
- `src/` — the portable Team Mate overlay. `src/AGENTS.md` defines the role;
  `src/skills/` holds the skills, `src/scripts/` deterministic helpers,
  and `src/templates/` the brief and report templates. Skills are installed
  into the primary's `.agents/skills/`, so the overlay is copied into a primary
  repository to make it a Team Mate primary.

## Documentation workflow

- Read `docs/VISION.md` before changing the product model.
- Read the relevant `docs/implementation/` pages before making architectural
  decisions.
- Keep the documentation consistent with the Herdr capabilities that Team Mate
  depends on.
- Treat implementation details as research until they are validated in a real
  environment.
- Prefer simple, reusable skills and scripts over application-specific
  abstractions.

## Herdr

Herdr is the current orchestration runtime used by Team Mate. Do not duplicate
Herdr's agent-runtime responsibilities inside this repository unless research
shows a clear need.

When documenting Herdr-dependent behavior, distinguish between:

1. capabilities guaranteed by Herdr;
2. behavior implemented by Team Mate skills/scripts;
3. behavior provided by the target project.

Verify Herdr behavior against its current documentation and real usage before
committing to an architecture.

## Agent design principles

- **Team Mate is the primary agent.** It coordinates other agents rather than
  being a fixed worker implementation.
- **Agents are dynamic.** Team Mate may create any number and type of agents
  when useful.
- **Project context is local.** An agent working on Project A should use Project
  A's context and should not accidentally inherit unrelated Project B context.
- **Shared capabilities are reusable.** Skills and scripts should work across
  projects whenever practical.
- **Evidence over claims.** Agent completion should trigger appropriate
  verification rather than automatic trust.
- **Developer visibility matters.** Important progress, logs, findings, and
  decisions should remain understandable to the developer.
- **Avoid premature architecture.** This repository is currently an R&D effort;
  validate workflows before building a large runtime or framework.

## Research direction

The long-term implementation is intentionally undecided. Research should
explore:

- the best skill structure;
- how Team Mate discovers and loads shared skills;
- how project-local skills compose with Team Mate skills;
- reliable Herdr agent lifecycle management;
- multi-project context isolation;
- progress and log collection;
- review and feedback workflows;
- failure recovery and cancellation;
- persistent task history;
- security and permission boundaries;
- portability across coding-agent environments.
