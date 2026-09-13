# src — Team Mate overlay

`src/` is the portable Team Mate source overlay: the role, skills, scripts,
config, and templates. The [install](#install) step places each file in the
right location inside a **primary repository**, turning it into a Team Mate
primary.

Herdr is the agent runtime; Team Mate is the coordination layer on top of it.

## Contents

```text
src/
  AGENTS.md            # Team Mate role → installed as <primary>/AGENTS.md
  team-mate.toml       # default limits and worker kind
  skills/              # Team Mate skills:
                       #   team-mate, delegate-task, monitor-agents,
                       #   review-work, report-progress, multi-project-context
  scripts/             # Python helpers:
                       #   tm.py — low-noise Herdr wrapper (workers in tabs)
                       #   task_store.py — file-backed task ledger (~/.teammate)
  templates/           # worker brief and developer report templates
```

## Install

Run the installer from the repository root. It creates `./teammate`, installs
the overlay, initializes a git repository, checks for Herdr, and launches
Herdr:

```bash
./install.sh --kind opencode
```

Or without a local checkout:

```bash
curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh \
  | sh -s -- --kind opencode
```

Options: `--dir DIR` (default `./teammate`), `--kind KIND`, `--force`,
`--no-launch`. Existing files are never overwritten unless `--force` is given.

The installer maps `src/` into the primary:

```text
src/AGENTS.md       -> <primary>/AGENTS.md
src/team-mate.toml  -> <primary>/team-mate.toml
src/skills/         -> <primary>/.agents/skills/
src/scripts/        -> <primary>/scripts/
src/templates/      -> <primary>/templates/
```

Do not copy `src/README.md`. Target projects are separate: they keep their own
`AGENTS.md` and `CONTEXT.md`, which workers read instead of inheriting the
primary's.

## Workspaces

- The primary runs in the `teammate` workspace.
- Each target project gets its own Herdr workspace named after the project.
  `tm spawn --project "<name>"` reuses or creates it, then starts the worker in
  a new **tab** there — never a split pane.
- A project workspace is created on the first spawn and is removed when its
  last worker tab closes. Keep a tab open if you want the workspace to persist.

## Status

Phases 0–3 validated: the overlay installs, a fresh session assumes the Team
Mate role, the skills are discovered, and the `tm` CLI drives a worker through
delegate → monitor → review → rework on a real Herdr session. Multi-project,
reliability, and portability remain — see `docs/NEXT.md`.
