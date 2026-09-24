# Install Team Mate

This guide is the friendly path from nothing to a working Team Mate primary: one
command or one prompt, what lands on disk, how a legacy install is replaced, and
what you see when you open the harness.

## Two ways to install

Pick either — they do the same thing.

### 1. One command

Installs into `./teammate`, detects your harness, and sets everything up:

```bash
curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s --
```

### 2. One prompt

Paste this into your AI agent and let it run the install and explain the result:

```text
Set up Team Mate and tell me what it can do.

1. Run:
   curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s --
2. Read the installed `teammate/AGENTS.md`.
3. Introduce Team Mate and give me 3 example prompts I can try.
```

Both paths create `./teammate` by default. Choose another directory with
`--dir`, and pin a harness with `--harness` (see [Options](#options)).

## What gets installed

The installer copies the Team Mate overlay into the target directory and puts
each file where your harness looks for it:

| From `src/` | Installed to |
| --- | --- |
| `AGENTS.md` | `<dir>/AGENTS.md` — or `CLAUDE.md` for `claude` |
| `team-mate.toml` | `<dir>/team-mate.toml` |
| `skills/` | `<dir>/<harness skills dir>/` (for example `.opencode/skills`) |
| `agents/` | `<dir>/agents/` — then synced to the harness agent directory |
| `scripts/` | `<dir>/scripts/` |
| `templates/` | `<dir>/templates/` |

For `claude`, the `skills/` and `agents/` rows are handled by the plugin rather
than copied into harness-native directories; see [Claude Code](#claude-code).

For `opencode` it also writes `opencode.json` with the permissions the primary
needs to read and write its own state directory, and it initializes a git
repository so the directory is a project root for skill discovery. It never
installs or launches a runtime — your coding harness already is the runtime.

### Claude Code

For the `claude` harness the installer sets Team Mate up as a Claude plugin
automatically — there is no separate flag — so the skills, worker subagents,
hooks, and `tm` wrapper are available in Claude Code and Cowork. The plugin
carries all of them; alongside it the installer writes `CLAUDE.md`,
`team-mate.toml`, `scripts/`, and `templates/` at the root. It lands at
`<dir>/.claude/plugins/teammate` and prints the command that loads it:

```bash
claude --plugin-dir "<dir>/.claude/plugins/teammate"
```

## Supported harnesses

| Harness | `--harness` | Instruction file | Skills directory | Agent definitions |
| --- | --- | --- | --- | --- |
| OpenCode | `opencode` | `AGENTS.md` | `.opencode/skills` | `.opencode/agents/` |
| Codex | `codex` | `AGENTS.md` | `.agents/skills` | `.codex/agents/` |
| Claude Code | `claude` | `CLAUDE.md` | `.claude/plugins/teammate/skills` | `.claude/plugins/teammate/agents/` |
| Pi | `pi` | `AGENTS.md` | `.pi/skills` | `.pi/agents/` |
| omp ("Oh My Pi") | `omp` | `.omp/AGENTS.md` | `.omp/skills` | `.omp/agents/` |

The harness is auto-detected from the environment; when detection cannot tell,
the installer falls back to `opencode`. Pass `--harness` to be explicit. Claude
Code is the exception: the installer packages its skills and agent definitions
inside the plugin at `.claude/plugins/teammate/`, rather than writing them to a
harness-native directory. The full adapter matrix is in
[Harness adapters](implementation/16-harness-adapters.md).

## Options

```text
-d, --dir DIR        directory to create/use (default: ./teammate)
    --harness NAME   opencode, codex, claude, pi, or omp
                     (default: detected, else opencode)
-f, --force          overwrite existing files (keeps a .bak copy)
-h, --help           show this help
```

Overwrite behavior is deliberately conservative. A file that is already
identical is skipped silently. A file that differs is left alone and warned
about, unless you pass `--force`. Two cases update in place without `--force`:
a legacy install being upgraded, and a managed `team-mate.toml` that already
carries a `harness` key. In every replaced case the previous file is kept as a
`.bak` copy, and a re-run is idempotent.

### Run from a local checkout

The one-liner always tracks the `master` branch. To install the version in front
of you, run the script directly instead:

```bash
./install.sh            # or: sh install.sh
./install.sh --harness codex --dir my-primary
```

## What happens to an old install

If the target directory holds a **legacy Herdr-era install**, the installer
replaces it automatically — there is nothing to clean up by hand:

- it removes the old runtime artifacts: the `runtime` / `worker_kind` /
  `primary_workspace` keys in `team-mate.toml`, `scripts/runtimes.py`,
  `scripts/tests/test_runtimes.py`, the `.agents/skills/herdr` skill, and the
  old managed-skills manifest;
- it backs up any file it replaces to a `.bak` copy next to the original;
- it installs the new harness-native configuration in the same pass.

It never touches your own files: anything the installer did not create is left
exactly as it was. Because the whole step is idempotent, running the installer
again is a no-op once you are on the new layout.

## After install: open your harness

```bash
cd teammate
opencode        # or: codex / claude / pi / omp
```

The installed instruction file (`AGENTS.md`, or `CLAUDE.md` for Claude Code)
makes the agent Team Mate, so you talk to it the same way you talk to any other
session in that harness. On Claude Code the plugin is installed for you; load it
with the command the installer printed (shown here for the default `./teammate`):

```bash
claude --plugin-dir "teammate/.claude/plugins/teammate"
```

## First run: what the agent says

On first contact Team Mate introduces itself: what it is (a primary engineering
agent that plans, delegates to the harness's native subagents, reviews their
work, and reports back), what it can take on, and how to hand it a task. It also
offers a few example prompts to get started, such as pointing it at a project,
asking it to plan a feature, or asking it to investigate a bug.

From there you drive: give it a goal, and it decides which workers to create,
keeps the ledger, and checks the results before reporting to you. Consequential
actions — commits, merges, pushes, deploys, deletes — stay in your hands.
