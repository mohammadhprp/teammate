# Context

Repository-specific guidance for working in Team Mate.

## Repository

Team Mate is a research and tooling project for building a reusable operating
model for a primary AI engineering agent.

The primary agent runs inside a coding harness — OpenCode, Codex, Claude Code,
Pi, or omp. Workers are the harness's **native subagents**, spawned by the
primary through that harness's own subagent tool, and can be created and managed
across multiple software projects. `tm` is a ledger-only CLI: it records tasks,
briefs, reports, findings, and decisions and renders each harness's adapter
files; it does not spawn processes. The overlay also ships as a Claude plugin
for Claude Code and Cowork.

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

## State layout

Coordination state lives under `state_dir` (default `~/.teammate/`), one
directory per project named after the project's slug (`slug()` in
`src/scripts/task_store.py`: lowercase, every run of characters outside
`[a-z0-9._-]` collapsed to `-`, edges trimmed):

```text
~/.teammate/
  projects.json          # shared: project name -> absolute root
  <project-slug>/
    tasks/<id>.json      # the live ledger
    archive/<id>.json    # pruned tasks (moved, never deleted)
    briefs/              # briefs the primary hands workers
    reports/             # saved worker reports
    timeline.jsonl       # append-only events
    session.json         # the open session marker
```

`projects.json` is the only shared file. `tm` resolves a command's project from
`--project`, else the `--task` task's project, else the registered project that
contains the current directory, and otherwise fails with a clear error. Legacy
root-level state is migrated into the per-project directories on the next run
(idempotent); anything unattributable stays at the root and is reported.

## Key files

- `README.md` — project overview.
- `docs/VISION.md` — product vision and operating model.
- `docs/implementation/` — long-term R&D, architecture, experiments, and
  decisions.
- `docs/NEXT.md` — what to build next.
- `src/` — the portable Team Mate overlay. `src/AGENTS.md` defines the role;
  `src/skills/` holds the skills, `src/agents/` the canonical worker
  definitions, `src/scripts/` deterministic helpers, and `src/templates/` the
  brief and report templates. Skills are installed into the primary's harness
  skills directory, so the overlay is copied into a primary repository to make
  it a Team Mate primary.

## Two skill sets

This repository carries two unrelated skill sets:

- `.agents/skills/` — the coding agent's own skills for working on *this*
  repository (for example `commit`, `review`, `skill-creator`, `adhd`,
  `ponytail`). This is tooling, not the product; `install.sh` does not install
  it.
- `src/skills/` — the Team Mate product overlay installed into a primary
  repository. These are the skills the product ships; `find-skills` and
  `agent-browser` exist in both, in the root set for working here and in the
  overlay as product skills.

Do not confuse the two: the root set is not the product.

## Documentation workflow

- Read `docs/VISION.md` before changing the product model.
- Read the relevant `docs/implementation/` pages before making architectural
  decisions.
- Keep the documentation consistent with the harness capabilities Team Mate
  depends on (the adapter matrix in
  `docs/implementation/16-harness-adapters.md`).
- Treat implementation details as research until they are validated in a real
  environment.
- Prefer simple, reusable skills and scripts over application-specific
  abstractions.

## Harness

Team Mate runs inside one **coding harness**: `opencode`, `codex`, `claude`,
`pi`, or `omp`. Workers are that harness's **native subagents**, spawned through
its subagent tool. `tm` selects the harness from the `--harness` flag, then
`TM_HARNESS`, then the `harness` key in `team-mate.toml`, then best-effort
detection; the flag must precede the subcommand, for example
`tm --harness claude task list`. The overlay also ships as a **Claude plugin**
rooted at `src/` for Claude Code and Cowork.

`tm` is **ledger-only**: `session`, `project`, `task` (including
`update --worker`), `brief`, `report`, `diff`, `skills sync --cwd`,
`agents sync --cwd`, `permissions`, and `harness`. It never spawns, sends to,
waits on, or stops a process. Spawning a worker, waiting for it, and closing it
are the primary's harness tools.

The per-harness adapter matrix — subagent tool, agent definitions, skills
directory, instruction file, config file, headless command, and background
support — is in
[Harness adapters](implementation/16-harness-adapters.md).

When documenting harness-dependent behavior, distinguish between:

1. capabilities guaranteed by the harness;
2. behavior implemented by Team Mate skills/scripts;
3. behavior provided by the target project.

Verify harness behavior against its current documentation and real usage before
committing to an architecture; the adapter matrix marks what is uncertain.

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
- reliable agent lifecycle management across harnesses;
- multi-project context isolation;
- progress and log collection;
- review and feedback workflows;
- failure recovery and cancellation;
- persistent task history;
- security and permission boundaries;
- portability across coding-agent harnesses.
