# Team Mate

<p align="center">
  <img src=".github/assets/overview.png" alt="Team Mate Architecture" />
</p>

Team Mate is a **primary AI engineering agent** that coordinates other coding
agents across multiple projects.

The developer talks to Team Mate through any supported coding agent such as
OpenCode, Codex, or Pi. Team Mate understands its role from the project's
`AGENTS.md` and uses [Herdr](https://herdr.dev) to create, manage, monitor, and coordinate other
agents.

## Core idea

```text
Developer
    │
    ▼
Team Mate (Primary Agent)
    │
    ├── Project A
    │     ├── Agent A1
    │     └── Agent A2
    │
    ├── Project B
    │     ├── Agent B1
    │     └── Agent B2
    │
    └── Project C
          └── Agent C1
```

Each project keeps its own context, `AGENTS.md`, skills, scripts, and other
project-specific resources. Team Mate supplies shared capabilities on top of
that project context.

## Documentation

- [Vision](docs/VISION.md) — product vision and operating model.
- [Context](docs/CONTEXT.md) — repository guidance.
- [Research and architecture](docs/implementation/README.md) — long-term R&D,
  architecture questions, and decisions.
- [Next steps](docs/NEXT.md) — current research priorities.

## Status

**Research and design phase.** The repository intentionally does not commit to
a specific implementation architecture yet. Herdr is the current runtime
foundation for agent orchestration, while the Team Mate repository focuses on
the reusable coordination knowledge, skills, scripts, and workflows built on
top of it.
