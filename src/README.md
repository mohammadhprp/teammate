# src — Team Mate overlay

`src/` is the portable Team Mate source overlay: the role, skills, agent
definitions, scripts, config, and templates. The [install](#install) step places
each file in the right location inside a **primary repository**, turning it into
a Team Mate primary.

The coding harness is the agent runtime; Team Mate is the coordination layer on
top of it. Workers are the harness's **native subagents** — `tm` records the
ledger and renders the adapter files, but the primary spawns, waits on, and
closes workers through the harness itself.

## Contents

```text
src/
  AGENTS.md            # Team Mate role → installed as <primary>/AGENTS.md
                       #   (or CLAUDE.md for the claude harness)
  team-mate.toml       # default limits and harness
  agents/              # canonical worker agent definitions (developer, reviewer,
                       #   tester, investigator) → rendered per harness
  skills/              # Team Mate skills, by audience:
                       #   teammate: team-mate, onboard-developer,
                       #             bootstrap-project, plan-work,
                       #             task-ledger, delegate-task, monitor-agents,
                       #             independent-review, review-work,
                       #             run-rework, escalate-decision,
                       #             report-progress, visual-report,
                       #             parallel-coordination,
                       #             recover-run, multi-project-context
                       #   common:   commit-changes, review-change,
                       #             showcase-work, load-project-context,
                       #             verify-evidence, handoff-report,
                       #             debug-issue, agent-browser
                       #   worker:   worker-role, accept-assignment,
                       #             implement-task, verify-change,
                       #             raise-blocker, report-result,
                       #             review-task, investigate-issue
  scripts/             # Python helpers:
                       #   tm.py — harness-aware ledger CLI (no process spawning)
                       #   task_store.py — file-backed task ledger (~/.teammate)
                       #   harnesses.py — per-harness adapter descriptors
  templates/           # worker brief, developer report, and project AGENTS templates
```

## Install

Run the installer from the repository root. It creates `./teammate`, installs
the overlay for the chosen harness, and initializes a git repository:

```bash
./install.sh
```

Or without a local checkout — one curl, harness auto-detected:

```bash
curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s --
```

Options: `--dir DIR` (default `./teammate`), `--harness HARNESS`
(`opencode`, `codex`, `claude`, `pi`, or `omp`; default: detected from the
environment, else `opencode`), and `--force`. Identical files are skipped
silently; a differing file is left alone and warned about unless `--force` is
given, while a legacy install and a managed `team-mate.toml` are updated
automatically with a `.bak` copy. A re-run is idempotent.

The installer maps `src/` into the primary, choosing the instruction file, the
skills directory, and the agent-definition format for the harness:

```text
src/AGENTS.md       -> <primary>/AGENTS.md   (or CLAUDE.md for claude)
src/team-mate.toml  -> <primary>/team-mate.toml
src/skills/         -> <primary>/<harness skills dir>/   (e.g. .opencode/skills)
src/agents/         -> <primary>/agents/     (canonical; synced to the harness agent dir)
src/scripts/        -> <primary>/scripts/
src/templates/      -> <primary>/templates/
```

It copies the skills into place directly, then runs
`tm --harness <harness> agents sync --cwd <primary>` so the installer and a
later `tm agents sync` agree on the same adapter. It does not install or launch
a runtime. For the `claude` harness it also installs Team Mate as a Claude
plugin automatically (no separate flag). A legacy Herdr-era install in the
target directory is replaced automatically — old runtime artifacts are removed,
replaced files are kept as `.bak`, and your own files are left alone; see the
[Install guide](../docs/INSTALL.md). Per-harness paths and formats are in
[Harness adapters](../docs/implementation/16-harness-adapters.md).

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

All coordination state lives under `state_dir` (default `~/.teammate/`), one
directory per project (the project name slugged to a filesystem-safe
lowercase form):

```text
~/.teammate/
  projects.json                # shared: project name -> absolute root
  <project-slug>/
    tasks/<id>.json            # one file per task (the ledger)
    archive/                   # pruned tasks (moved, never deleted)
    briefs/                    # the briefs the primary sends workers
    reports/                   # captured worker output
    timeline.jsonl             # append-only events
    session.json               # the open session marker
```

Legacy state that lived directly under `~/.teammate/` is migrated into the
per-project directories on the next run (`tm` calls the idempotent migration
automatically); anything that cannot be attributed to a project stays at the
root and is reported.

- `tm brief <name> [--task <id>] [--project <name>]` reads a brief from stdin,
  writes it under the project's `briefs/`, and prints the path to pass as the
  subagent's prompt. The project is `--project`, else the task's, else the
  registered project containing the current directory. Use it instead of
  inventing a path, so a run never writes outside the sandbox.
- `tm report <name> [--save] [--task <id>] [--project <name>]` reads the clean
  markdown the worker wrote to `.teammate-report.md` in its project root,
  falling back to the report stored on the task, and prints it. With `--save`
  it writes the report under the project's `reports/` and prints the path.
- `tm session start` / `status` / `end` / `summary` act on one project
  (`--project`, else the registered project containing the current directory);
  tasks created while a session is open are tagged with it, so `tm task list`
  shows the current session and recovery can ignore history. `--all` shows
  every session.
- `tm task list` spans every project by default; pass `--project <name>` to
  scope it. `tm task prune` archives closed tasks (moved to the project's
  `archive/`) so the live ledger stops accumulating stale work; scope it with
  `--project`, `--session <id>`, or `--all`.


## Skill distribution

The overlay installs skills into the primary's harness skills directory (for
example `.opencode/skills` for opencode, `.agents/skills` for codex). A worker
subagent runs in a target project's own harness context, so it cannot see them.
`tm skills sync` copies the common and worker skills into the project's harness
skills directory:

```bash
python3 scripts/tm.py --harness codex skills sync --cwd "<project-root>"
```

- `worker_skills` in `team-mate.toml` lists what is copied; `distribute_skills =
  false` turns the sync off.
- The copy is idempotent and tracked in the project's
  `<skills-dir>/.teammate-managed.json`. A skill the project already owns is
  never overwritten.
- Managed entries are added to the project's `.git/info/exclude` (local only),
  so they do not show as untracked.

### Two skill populations

A project's harness skills directory can hold skills from two sources, tracked
separately:

| Population | Installed by | Tracked in | On a name collision |
| --- | --- | --- | --- |
| Team Mate-managed | `tm skills sync` | `.teammate-managed.json` | The project's copy wins; the sync skips it. |
| Skills CLI | `npx skills add` (`bootstrap-project`) | `skills-lock.json` | `npx skills` owns it; a sync never overwrites it. |

A sync writes only names listed in `worker_skills` and updates only names it
already manages, so it never clobbers a Skills-CLI-installed or
developer-authored skill. If a desired name already belongs to the other
population, resolve it explicitly rather than expecting a sync to replace it.

## Harnesses

- The primary runs inside one harness. `tm --harness` selects it; the `harness`
  key in `team-mate.toml` (or `TM_HARNESS`) sets it persistently.
- `tm agents sync --cwd <project>` renders the canonical worker definitions
  (`src/agents/*.md`) into the project's harness agent-definitions directory —
  for example `.opencode/agents/*.md` for opencode, `.codex/agents/*.toml` for
  codex, or `.claude/agents/*.md` for claude.
- `tm harness` prints the resolved adapter: subagent tool, agent-definitions
  directory and format, skills directory, instruction file, config file,
  headless command, and background support.
- The adapter matrix and the per-harness uncertainties are in
  [Harness adapters](../docs/implementation/16-harness-adapters.md).

## Tests

Run the script tests from the repository root:

```bash
python3 -m unittest discover -s src/scripts/tests -t src/scripts
```

## Status

The operating model was validated end to end in earlier runs (opencode and
`omp`): skill distribution, the full loop, fail → rework → pass, parallel
projects, cancellation, orphan reconciliation, blocked-worker escalation, and
recovery of a running task after the primary loses its context. Those runtime
mechanics now belong to the harness; `tm` keeps the ledger half (tasks, briefs,
reports, findings, decisions) and the per-harness adapters. The hardening plan from the process review is implemented
(brief/report locations, provisioned permissions, worker boundaries,
session-scoped and prunable ledger, enforced evidence honesty, bootstrap
validators). What remains is the parallel-run work named in `docs/NEXT.md` —
per-stream ports and browser sessions (E2), keeping review tasks out of the
approval queue (E4), a quiet `task show` (E5), and interim status on long
builds (E6) — plus the open questions.
