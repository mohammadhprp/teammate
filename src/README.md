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
                       #   teammate: team-mate, onboard-developer,
                       #             bootstrap-project, plan-work,
                       #             task-ledger, delegate-task, monitor-agents,
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
  templates/           # worker brief, developer report, and project AGENTS templates
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

The installer also provisions permissions. `~/.teammate/**` and each target
project root sit outside the primary's working directory, so OpenCode prompts
before it touches them. The installer runs `tm permissions init` to write an
`opencode.json` allowing the state dir; `tm permissions allow --cwd <root>`
adds a durable rule for a project (`bootstrap-project` runs it). Both merge into
the file instead of replacing it. OpenCode loads configuration when a session
starts, so a rule added mid-session applies from the next one; for a brand-new
project, allow it before the primary needs it, or choose **always** on the
one-time prompt. (OpenCode V2 uses the `permissions` array; V1 uses `permission`
with `bash`/`task` action names.)

Do not copy `src/README.md`. Target projects are separate: they keep their own
`AGENTS.md` and `CONTEXT.md`, which workers read instead of inheriting the
primary's.

## Ledger, briefs, and reports

All coordination state lives under `state_dir` (default `~/.teammate/`):

```text
~/.teammate/
  tasks/<id>.json     # one file per task (the ledger)
  archive/            # pruned tasks (moved, never deleted)
  briefs/             # the briefs the primary sends workers
  reports/            # captured worker output
  timeline.jsonl      # append-only events
  session.json        # the open session marker
```

- `tm brief <name> [--task <id>]` reads a brief from stdin, writes it under
  `briefs/`, and prints the path to pass to `tm send`. Use it instead of
  inventing a path, so a run never writes outside the sandbox.
- `tm report <name> --save [--task <id>]` writes a worker's output under
  `reports/` and prints the path. It prefers the clean markdown the worker
  wrote to `.teammate-report.md` in its project root and falls back to the
  captured terminal pane only when that file is absent.
- `tm session start` / `end` mark the primary's session; tasks created while a
  session is open are tagged with it, so `tm task list` shows the current
  session and recovery can ignore history. `--all` shows every session.
- `tm task prune` archives closed tasks (moved to `archive/`) so the live ledger
  stops accumulating stale work; scope it with `--session <id>` or `--all`.


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

### Two skill populations

A project's `.agents/skills/` can hold skills from two sources, tracked
separately:

| Population | Installed by | Tracked in | On a name collision |
| --- | --- | --- | --- |
| Team Mate-managed | `tm spawn` / `tm skills sync` | `.teammate-managed.json` | The project's copy wins; the sync skips it. |
| Skills CLI | `npx skills add` (`bootstrap-project`) | `skills-lock.json` | `npx skills` owns it; a sync never overwrites it. |

A sync writes only names listed in `worker_skills` and updates only names it
already manages, so it never clobbers a Skills-CLI-installed or
developer-authored skill. If a desired name already belongs to the other
population, resolve it explicitly rather than expecting a sync to replace it.

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

Validated end to end on live Herdr sessions with opencode and `omp`: skill
distribution, the full loop, fail → rework → pass, parallel projects,
cancellation, orphan reconciliation, blocked-worker escalation, and recovery of
a running task after the primary loses its context. The hardening plan from the
process review is implemented (brief/report locations, provisioned permissions,
worker boundaries, session-scoped and prunable ledger, enforced evidence
honesty, bootstrap validators); what remains is the open questions — see
`docs/NEXT.md`.
