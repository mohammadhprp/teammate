# Team Mate — Claude plugin

Team Mate packaged as a Claude Code / Cowork plugin named **`teammate`**. It
brings the Team Mate worker roles and skills into Claude Code and Cowork
alongside the existing Herdr runtime, so the same coordination model runs in
either place.

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
  scripts/                     # tm.py, task_store.py, runtimes.py
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

### 2. `--plugin-dir` (development)

Load the plugin straight from a checkout for one session, with no install step:

```bash
claude --plugin-dir /path/to/teammate-dev/src
```

### 3. `--plugin` (installer)

The repository installer installs the plugin alongside the primary it creates:

```bash
./install.sh --plugin
```

That installs `src/` to `<dir>/.claude/plugins/teammate` (default `<dir>` is
`./teammate`), excluding `tests/`, `__pycache__/`, and `*.pyc`, prints the
command that loads it, and stops without requiring or launching Herdr:

```bash
claude --plugin-dir "<dir>/.claude/plugins/teammate"
```

Use `--dir DIR` to choose the primary directory. Every other `install.sh` option
and the default behavior are unchanged when `--plugin` is absent.

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
  session can run `tm task list`, `tm spawn`, and the other ledger commands.
- **Hooks** are best-effort and never block a session:
  - `SessionStart` records an open Team Mate session.
  - `SubagentStop` captures the worker's `.teammate-report.md` into the task
    ledger. If `tm` is missing or fails, both hooks exit 0.

## Runtime selection

`tm` chooses its runtime in this order:

1. the `--runtime` flag,
2. the `TM_RUNTIME` environment variable,
3. the `runtime` key in `team-mate.toml`.

Valid values are `herdr` and `claude`. **Herdr is the default**; `claude` is the
optional headless backend that this plugin makes usable inside Claude Code and
Cowork. The plugin does not implement runtime selection — it relies on the `tm`
contract above.

## Validate

```bash
claude plugin validate ./src
```
