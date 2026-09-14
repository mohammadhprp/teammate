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
  skills/              # Team Mate skills, by audience:
                       #   teammate: team-mate, plan-work, task-ledger,
                       #             delegate-task, monitor-agents,
                       #             independent-review, review-work,
                       #             run-rework, escalate-decision,
                       #             report-progress, parallel-coordination,
                       #             recover-run, multi-project-context
                       #   common:   commit-changes, review-change,
                       #             showcase-work, load-project-context,
                       #             verify-evidence, handoff-report,
                       #             debug-issue
                       #   worker:   worker-role, accept-assignment,
                       #             implement-task, verify-change,
                       #             raise-blocker, report-result,
                       #             review-task, investigate-issue
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

## Skill distribution

The overlay installs skills into the primary's `.agents/skills/`. A worker runs
in a target project's tab with `--cwd <project>`, so it cannot see them.
`tm spawn` copies the common and worker skills into `<project>/.agents/skills/`
before starting the agent:

```bash
python3 scripts/tm.py skills sync --cwd "<project-root>"
```

- `worker_skills` in `team-mate.toml` lists what is copied; `distribute_skills =
  false` turns the spawn-time sync off.
- The copy is idempotent and tracked in
  `<project>/.agents/skills/.teammate-managed.json`. A skill the project already
  owns is never overwritten.
- Managed entries are added to the project's `.git/info/exclude` (local only),
  so they do not show as untracked.

## Workspaces

- The primary runs in the `teammate` workspace.
- Each target project gets its own Herdr workspace named after the project.
  `python3 scripts/tm.py spawn --project "<name>"` reuses or creates it, then
  starts the worker in a new **tab** there — never a split pane.
- A project workspace is created on the first spawn and is removed when its
  last worker tab closes. Keep a tab open if you want the workspace to persist.

## Tests

Run the script tests from the repository root:

```bash
python3 -m unittest discover -s src/scripts/tests -t src/scripts
```

## Status

Phases 0–3 validated: the overlay installs, a fresh session assumes the Team
Mate role, the skills are discovered, and the `tm` CLI drives a worker through
delegate → monitor → review → rework on a real Herdr session. Multi-project,
reliability, and portability remain — see `docs/NEXT.md`.
