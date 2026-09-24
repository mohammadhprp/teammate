# Team Mate

<p align="center">
  <img src=".github/assets/overview.png" alt="Team Mate Architecture" />
</p>

Team Mate is a **primary AI engineering agent** that coordinates the native
subagents of your coding harness across multiple projects.

## Quick start

**Ask your Agent** — paste this into your AI agent to install and get an intro:

```text
Set up Team Mate and tell me what it can do.

1. Read and install this for user https://github.com/mohammadhprp/teammate
2. Read the installed `teammate/AGENTS.md`.
3. Introduce Team Mate and give me 3 example prompts I can try.
```

**One command** — installs into `./teammate` and detects your harness:

```bash
curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s --
```

Then `cd teammate` and open your harness. The full walkthrough is in the
[Install guide](docs/INSTALL.md).

## Supported harnesses

`opencode` · `codex` · `claude` · `pi` ·
`omp`.

## Documentation

- [Install guide](docs/INSTALL.md) — install paths, options, legacy replacement.
- [Vision](docs/VISION.md) — product vision and operating model.
- [Context](docs/CONTEXT.md) — repository guidance.
- [Research and architecture](docs/implementation/README.md).
- [Overlay](src/README.md) — the portable overlay.
