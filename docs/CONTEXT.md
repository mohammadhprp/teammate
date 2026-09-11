# Context

Repository-specific guidance for working in Team Mate.

## Repository

Team Mate is an OpenCode v2 plugin project. The repository currently contains
design documentation; there is no application code, package manifest, or test
suite yet.

## Key files

- `README.md` — project name.
- `docs/VISION.md` — product vision and workflow.
- `docs/implementation/` — implementation design. Start with
  `docs/implementation/README.md`.
- `.opencode/AGENTS.md` — behavioral guidelines.

## Workflow

- Read `docs/VISION.md` and the relevant `docs/implementation/` page before
  changing the design.
- Keep the design and the documentation in sync. Update the implementation docs
  when behavior or API usage changes.
- Verify OpenCode v2 API signatures against the installed packages before
  writing code. The implementation docs record known surface gaps.
- Wrap prose at 80 characters, use sentence case headings, and follow
  `.opencode/skills/docs-writer/references/style-guide.md` for documentation.

## Directive: always use ponytail

Always use the `ponytail` skill for coding, implementation, refactoring, design,
dependency choices, and over-engineering reviews. Apply it before adding code,
abstractions, configuration, or dependencies. Prefer the simplest solution that
satisfies the requirement.
