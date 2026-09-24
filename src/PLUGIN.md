# Team Mate — Claude plugin

Team Mate packaged as a Claude Code / Cowork plugin named **`teammate`**. It
brings the Team Mate worker roles and skills into Claude Code and Cowork — the
Claude harness adapter of the harness-native subagent model — so the same
coordination model runs wherever Claude Code runs.

The plugin root is `src/`, the same tree as the rest of the Team Mate overlay:
its `skills/`, `scripts/`, `templates/`, and `team-mate.toml` are the
repository's source of truth. There are no copies and no build step — edit
`src/` once and it is used both as the portable overlay and as the plugin.

## Layout

```text
src/                           # plugin root
  .claude-plugin/plugin.json   # plugin manifest (name, description, version, repository)
  agents/                      # developer, reviewer, tester, investigator subagents
  skills/                      # Team Mate skills, namespaced /teammate:<skill>
  scripts/                     # tm.py, task_store.py, harnesses.py
  templates/                   # worker brief, developer report, project AGENTS
  team-mate.toml               # default Team Mate config
  bin/tm                       # POSIX sh wrapper over scripts/tm.py, on the Bash PATH
  hooks/                       # hooks.json + SessionStart and SubagentStop scripts
```

Only `plugin.json` lives inside `.claude-plugin/`.

## Install

Three ways to get the plugin into a Claude environment.

### 1. Marketplace

If a marketplace catalogs this plugin (this repository under `src/`, or your own
catalog that points at it), add the marketplace and install from it:

```bash
claude plugin marketplace add <owner/repo>
claude plugin install teammate@<marketplace>
```

The marketplace entry must reference the plugin root `src/`; the repository
ships the plugin but does not itself define a catalog.

### 2. From a checkout (development)

Load the plugin straight from a checkout for one session, with no install step:

```bash
claude --plugin-dir /path/to/teammate-dev/src
```

### 3. Installer (automatic)

Installing Team Mate for the `claude` harness sets up the plugin automatically —
there is no separate flag:

```bash
curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s -- --harness claude
```

That installs `src/` to `<dir>/.claude/plugins/teammate` (default `<dir>` is
`./teammate`), excluding `tests/`, `__pycache__/`, and `*.pyc`, and prints the
command that loads it:

```bash
claude --plugin-dir "<dir>/.claude/plugins/teammate"
```

Use `--dir DIR` to choose the primary directory. The full installer guide is
[docs/INSTALL.md](../docs/INSTALL.md).

## Usage

With the plugin enabled:

- **Skills** are namespaced: `/teammate:team-mate`, `/teammate:implement-task`,
  `/teammate:verify-evidence`, and the rest of `src/skills/`.
- **Subagents** are available as `teammate:developer`, `teammate:reviewer`,
  `teammate:tester`, and `teammate:investigator`:
  - `developer` implements an assigned change in one project and reports.
  - `reviewer` independently reviews a change it did not write and returns
    findings with a verdict.
  - `tester` reproduces behavior and tests it, including boundary cases.
  - `investigator` answers a question read-only and reports evidence with a
    confidence level.
  Every worker reads its project's `AGENTS.md` / `CONTEXT.md` first and writes
  its final report to `.teammate-report.md` in the project root, in the
  `handoff-report` shape.
- **`tm`** is added to the Bash tool PATH while the plugin is enabled, so a
  session can run `tm task list`, `tm brief`, and the other ledger commands.
- **Hooks** are best-effort and never block a session:
  - `SessionStart` records an open Team Mate session.
  - `SubagentStop` captures the worker's `.teammate-report.md` into the task
    ledger. If `tm` is missing or fails, both hooks exit 0.

## Harness selection

Inside the plugin the harness is Claude: the plugin supplies the `claude`
adapter, and workers are Claude Code subagents. `tm` resolves the harness in
this order:

1. the `--harness` flag,
2. the `TM_HARNESS` environment variable,
3. the `harness` key in `team-mate.toml`,
4. best-effort detection.

Valid values are `opencode`, `codex`, `claude`, `pi`, and `omp`. The plugin does
not implement harness selection — it relies on the `tm` contract above.

## Validate

```bash
claude plugin validate ./src
```
