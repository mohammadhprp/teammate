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

Each project keeps its own context, `AGENTS.md`, skills, scripts, and other
project-specific resources. Team Mate supplies shared capabilities on top of
that project context.

## Overview

- [Vision](docs/VISION.md) — product vision and operating model.
- [Context](docs/CONTEXT.md) — repository guidance.
- [Research and architecture](docs/implementation/README.md) — R&D,
  architecture questions, and decisions.
- [Overlay](src/README.md) — current research priorities.
