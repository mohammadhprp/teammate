# Harness adapters

Team Mate is harness-native: the primary runs inside one coding harness, and
workers are that harness's **native subagents**. This page is the adapter matrix
— how each supported harness names its subagent tool, where it keeps agent
definitions and skills, which instruction and config files it reads, and how it
runs headless. It is the reference behind `harnesses.py` and `tm harness`.

Selection is **`--harness` → `TM_HARNESS` → the `harness` key in
`team-mate.toml` → best-effort detection**, in that order. Detection is a
convenience only and never overrides an explicit selection. `tm harness` prints
the resolved adapter:

```bash
tm --harness codex harness
```

## Matrix

| Harness | Subagent tool | Agent definitions | Skills directory | Instructions | Config | Headless | Background |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **opencode** | `task` (`subagent_type`, `prompt`, `description`, `background`) | `.opencode/agents/*.md` | `.opencode/skills` | `AGENTS.md` | `opencode.json` | `opencode run` | yes |
| **codex** | `spawn_agent` + `wait_agent` / `send_input` / `close_agent` (prompt-mediated) | `.codex/agents/*.toml` | `.agents/skills` | `AGENTS.md` | `.codex/config.toml` | `codex exec` | yes |
| **claude** | `Agent` tool (`subagent_type`, `prompt`, `run_in_background`) | `.claude/agents/*.md` | `.claude/skills` | `CLAUDE.md` | `.claude/settings.json` | `claude -p` | yes |
| **pi** | `subagent` tool from a Pi extension/package (no native subagent) | `.pi/agents/*.md` | `.pi/skills` | `AGENTS.md` | `.pi/settings.json` | `pi -p` | extension-dependent |
| **omp** ("Oh My Pi", a Pi fork) | `task` (batch `tasks[]` or flat; background by default) | `.omp/agents/*.md` | `.omp/skills` | `.omp/AGENTS.md` | `.omp/config.yml` | `omp -p` | yes |

`tm harness` prints the `background` field as a boolean: `false` means the
harness does not background a subagent by default (pi's depends on the
extension). Read the matrix's nuance, not the boolean alone, when it matters.

These are each harness's **native read paths** — where the harness itself looks
for skills, agents, and instructions. The installer follows them, with one
exception: for `claude` it packages the overlay as a plugin at
`.claude/plugins/teammate/` (carrying the skills, agent definitions, hooks, and
the `tm` wrapper) and writes `CLAUDE.md` at the root, instead of copying into
`.claude/skills` / `.claude/agents`.

## What `tm` does with an adapter

`tm` is ledger-only; it does not spawn workers. It uses the adapter to:

- **install skills** (`tm skills sync --cwd <project>`) into a target project's
  harness skills directory — not the primary, whose skills the installer copies
  directly (a `tm skills sync` self-copy would be a no-op);
- **render agent definitions** (`tm agents sync --cwd <project>`): the canonical
  `src/agents/*.md` files are copied as-is for the markdown harnesses, and
  converted to TOML (`name`, `description`, `developer_instructions`) for codex;
- **resolve instruction and config paths** when the installer places files and
  when skills/scripts refer to them.

The canonical worker definitions live in `src/agents/`: `developer.md`,
`reviewer.md`, `tester.md`, and `investigator.md`. A harness with a different
agent-definition schema gets a rendered form, not a second hand-maintained copy.

## opencode

- **Subagent tool.** `task`, with `subagent_type`, `prompt`, `description`, and
  `background`.
- **Agent definitions.** `.opencode/agents/*.md`; the canonical markdown is
  copied unchanged.
- **Skills.** `.opencode/skills`.
- **Instructions.** `AGENTS.md`.
- **Config.** `opencode.json` (also where `tm permissions init`/`allow` merge
  the state-dir and project-root rules).
- **Headless.** `opencode run`.
- **Background.** Supported (`background`).
- **Detection marker.** `OPENCODE`.

## codex

- **Subagent tool.** `spawn_agent`, plus `wait_agent`, `send_input`, and
  `close_agent` for lifecycle. Communication is prompt-mediated.
- **Agent definitions.** `.codex/agents/*.toml`; `tm agents sync` renders each
  canonical definition to TOML.
- **Skills.** `.agents/skills`.
- **Instructions.** `AGENTS.md`.
- **Config.** `.codex/config.toml`.
- **Headless.** `codex exec`.
- **Background.** Supported.
- **Detection markers.** `CODEX_HOME`, `CODEX_SANDBOX`.
- **Uncertainty.** The tool names are source-derived and version-sensitive;
  confirm them against the installed Codex.

## claude

- **Subagent tool.** The `Agent` tool, with `subagent_type`, `prompt`, and
  `run_in_background`.
- **Agent definitions.** `.claude/agents/*.md`; the canonical markdown is copied
  unchanged. The same files back the Claude plugin's `teammate:developer`,
  `teammate:reviewer`, `teammate:tester`, and `teammate:investigator`.
- **Skills.** `.claude/skills`.
- **Instructions.** `CLAUDE.md` — **not** `AGENTS.md`. The installer writes the
  overlay's `AGENTS.md` content to `CLAUDE.md` for this harness.
- **Config.** `.claude/settings.json`.
- **Headless.** `claude -p`.
- **Background.** Supported (`run_in_background`).
- **Detection marker.** `CLAUDECODE`.
- **Plugin.** The Claude plugin (see [PLUGIN.md](../../src/PLUGIN.md)) is the
  packaged form of this adapter for Claude Code and Cowork.

## pi

- **Subagent tool.** `subagent`, provided by a Pi extension/package. Pi has no
  native subagent tool, so the adapter is only usable when that extension is
  installed.
- **Agent definitions.** `.pi/agents/*.md`.
- **Skills.** `.pi/skills`.
- **Instructions.** `AGENTS.md`.
- **Config.** `.pi/settings.json`.
- **Headless.** `pi -p`.
- **Background.** Depends on the extension.
- **Detection markers.** `PI_CODING_AGENT_DIR`, `PI_SMOL_MODEL`.
- **Uncertainty.** The extension's exact tool surface and lifecycle are not
  verified here. Treat Pi as requiring an extension until a live check says
  otherwise.

## omp

- **Subagent tool.** `task`, accepting either a batch (`tasks[]`) or a flat call,
  with background subagents by default. "Oh My Pi" is a Pi fork.
- **Agent definitions.** `.omp/agents/*.md`.
- **Skills.** `.omp/skills`.
- **Instructions.** `.omp/AGENTS.md` (under the `.omp/` tree, unlike the
  harnesses whose instruction file sits at the project root).
- **Config.** `.omp/config.yml`.
- **Headless.** `omp -p`.
- **Background.** Supported and the default.
- **Detection marker.** `OMP_PROFILE` (checked before the `PI_*` markers omp may
  also carry).

## Uncertainties

The matrix is honest about what is settled and what is not. Before a run,
confirm the adapter against the installed harness rather than trusting this
page.

- **Codex tool names are source-derived and version-sensitive.** `spawn_agent`,
  `wait_agent`, `send_input`, and `close_agent` may differ by Codex version.
- **OpenCode's directories and config keys differ between V1 and V2.** The
  agent-definitions directory and the `opencode.json` permission shape
  (`permissions` array vs `permission` with `bash`/`task` action names) are
  version-dependent; this page names the V2-style paths.
- **Pi requires an extension.** There is no native subagent tool, so the
  `subagent` tool and its lifecycle come from a package that must be installed;
  background behavior is extension-dependent.
- **Claude's instruction file is `CLAUDE.md`, not `AGENTS.md`.** A reader who
  assumes one instruction filename across harnesses will be wrong for claude.
- **omp's background semantics and exact `task` call shape** are stated from its
  Pi-fork lineage and are not verified here.
- **Detection is best-effort.** The environment markers above can be absent
  (for example in a fresh shell or CI); pass `--harness` explicitly when it
  matters.

[Open question 6](14-open-questions.md) tracks the per-harness verification that
would turn these uncertainties into a tested table.
