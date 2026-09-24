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
| **opencode** | `subagent` (`agent`, `description`, `prompt`, `background`; legacy `subagent_type` alias) | `.opencode/agents/*.md` | `.opencode/skills` | `AGENTS.md` | `opencode.json` | `opencode run` | yes |
| **codex** | `spawn_agent` + `wait_agent` / `send_input` / `close_agent` (prompt-mediated) | `.codex/agents/*.toml` | `.agents/skills` | `AGENTS.md` | `.codex/config.toml` | `codex exec` | yes |
| **claude** | `Agent` tool (`subagent_type`, `prompt`, `run_in_background`) | `.claude/agents/*.md` | `.claude/skills` | `CLAUDE.md` | `.claude/settings.json` | `claude -p` | yes |
| **pi** | `subagent` tool from a Pi extension/package (no native subagent) | `.pi/agents/*.md` | `.pi/skills` | `AGENTS.md` | `.pi/settings.json` | `pi -p` | extension-dependent |
| **omp** ("Oh My Pi", a Pi fork) | `task` (batch `tasks[]` or flat; background by default) | `.omp/agents/*.md` | `.omp/skills` | `.omp/AGENTS.md` | `.omp/config.yml` | `omp -p` | yes |

`tm harness` prints the `background` field as a boolean: `false` means the
harness does not background a subagent by default (pi's depends on the
extension). Read the matrix's nuance, not the boolean alone, when it matters.
Every row is expanded in its own section below, where each agent-dimension
claim carries its source or is marked unverified.

These are each harness's read paths — where the harness itself looks for
skills, agents, and instructions. For `pi` the agent path is the subagent
*extension's* convention, not native Pi. The installer follows them, with one
exception: for `claude` it packages the overlay as a plugin at
`.claude/plugins/teammate/` (carrying the skills, agent definitions, hooks, and
the `tm` wrapper) and writes `CLAUDE.md` at the root, instead of copying into
`.claude/skills` / `.claude/agents`.

## What `tm` does with an adapter

`tm` is ledger-only; it does not spawn workers. It uses the adapter to:

- **install skills** (`tm skills sync --cwd <project>`) into a target project's
  harness skills directory — not the primary, whose skills the installer copies
  directly (a `tm skills sync` self-copy would be a no-op);
- **render agent definitions** (`tm agents sync --cwd <project>`): each
  canonical `src/agents/*.md` file is rendered into the harness's own schema —
  copied as-is for claude and pi, converted to TOML (`name`, `description`,
  `developer_instructions`) for codex, an opencode V2 subagent definition, or an
  omp definition with a YAML `tools` list and a model role;
- **resolve instruction and config paths** when the installer places files and
  when skills/scripts refer to them.

The canonical worker definitions live in `src/agents/`: `developer.md`,
`reviewer.md`, `tester.md`, and `investigator.md`. Each carries the same
frontmatter — `name`, `description`, `tools`, and `model` — and a markdown
body. A harness with a different agent-definition schema gets a rendered form,
not a second hand-maintained copy.

Whether that rendering is **sufficient** depends on the harness (see each
section): it is complete for codex (the three required TOML fields), claude,
and the pi example extension, and `tm agents sync` now renders the opencode V2
and omp schemas directly.

## opencode

Verified against opencode v2.0.16 (`opencode --version`) and the V2 docs
(<https://opencode.ai/v2/docs/agents/>, <https://opencode.ai/v2/docs/tools/>,
<https://opencode.ai/v2/docs/config/>); the tool id is also confirmed in the
installed binary.

- **Subagent tool.** `subagent`, with `agent` (the agent ID), `description`,
  `prompt`, and `background`. It returns a `sessionID` to continue that child
  conversation; the legacy `subagent_type` input is still accepted. V1 exposed
  this as the `task` tool, so a V1 session will not have a `subagent` tool.
- **Agent definitions.** `.opencode/agents/*.md` (project) and
  `~/.config/opencode/agents/*.md` (global). The file name is the agent ID; a
  nested path becomes a namespaced ID (`team/reviewer`). Frontmatter accepts
  the same fields as an `agents` configuration entry: `description`
  (required), `mode`, `model`, `permissions`, `system`, `steps`, `hidden`,
  `color`, `disabled`, and `request`; the body is the system prompt. V1 used
  `permission`, `tools`, `temperature`, `top_p`, `prompt`, `disable`, and
  `maxSteps` instead.
- **Config keys affecting agents.** `opencode.json`/`opencode.jsonc`: `agents`
  (V2; `agent` in V1) defines/overrides agents, `default_agent` selects the
  primary agent for a session with none, and V2 `permissions` (an array of
  `{action, resource, effect}`) gates tools with a `subagent` action that
  controls which agents a parent may launch. V1 used `permission` with
  `bash`/`task` action names. `tm permissions init`/`allow` merge the
  state-dir and project-root rules into this file.
- **Rendering.** `tm agents sync` writes a V2 subagent definition:
  `description`, `mode: subagent`, and a `permissions` allow-list — a deny-all
  rule followed by an `allow` per canonical tool, then one explicit `allow` for
  `skill` (the same shape the built-in `explore` agent uses). `skill` is not a
  canonical tool, but opencode V2 checks the `skill` permission when loading a
  skill, so without it the deny-all rule would leave a launched worker unable to
  load any Team Mate skill. It omits `name`, the legacy `tools` string, and
  `model`: an omitted `mode` defaults a new custom agent to `primary` (so
  `subagent` cannot launch it), a `name` field makes opencode read the legacy
  schema and ignore `permissions`, and a legacy `tools` string or a bare
  `sonnet`/`opus` alias makes opencode **drop the agent entirely** (so
  `subagent` reports `Unknown agent: <name>`). A subagent with no `model`
  inherits the parent session's model. Verified live against opencode v2.0.16:
  `opencode debug agents` lists all four synced workers with `mode: subagent`
  and the expected permissions.
- **Skills.** `.opencode/skills`.
- **Instructions.** `AGENTS.md`.
- **Headless.** `opencode run`.
- **Background.** Supported (`background: true` returns immediately and
  notifies the parent).
- **Detection marker.** `OPENCODE` (best-effort; not verified against a live
  environment here).

## codex

Verified against the current Codex docs
(<https://developers.openai.com/codex/agent-configuration/subagents>) and the
open-source implementation
(`codex-rs/core/src/tools/handlers/multi_agents_spec.rs` on `openai/codex`
`main`), which names the tools.

- **Subagent tool.** `spawn_agent`, plus `wait_agent`, `send_input`, and
  `close_agent`; the v2 surface adds `send_message`, `followup_task`,
  `resume_agent`, `list_agents`, and `interrupt_agent`. Communication is
  prompt-mediated and orchestration is the harness's.
- **Agent definitions.** `.codex/agents/*.toml` (project) and
  `~/.codex/agents/*.toml` (personal); each file is one agent and is loaded as
  a configuration layer. Required fields: `name`, `description`,
  `developer_instructions`. Optional: `model`, `model_reasoning_effort`,
  `sandbox_mode`, `mcp_servers`, `skills.config`. Built-in agents are
  `default`, `worker`, and `explorer`; a custom `name` overrides a built-in.
- **Config keys affecting agents.** `.codex/config.toml` under `[agents]`:
  `enabled` (default `true`), `max_concurrent_threads_per_session` (legacy
  alias `max_threads`), `default_subagent_model`,
  `default_subagent_reasoning_effort`, and `interrupt_message`.
- **Rendering.** `tm agents sync` renders each canonical definition to TOML
  with exactly `name`, `description`, and `developer_instructions` — the three
  required fields, so the rendering is sufficient.
- **Skills.** `.agents/skills`.
- **Instructions.** `AGENTS.md`.
- **Headless.** `codex exec`.
- **Background.** Supported: agents are spawned in parallel and Codex collects
  their results (`wait_agent` blocks for a result when the parent needs it).
- **Detection markers.** `CODEX_HOME`, `CODEX_SANDBOX` (best-effort; not
  verified against a live environment here).

## claude

Verified against the current Claude Code docs
(<https://code.claude.com/docs/en/sub-agents>,
<https://code.claude.com/docs/en/tools-reference>).

- **Subagent tool.** The `Agent` tool (renamed from `Task` in v2.1.63), with
  `subagent_type` (required, unless the session has a `general-purpose`
  fallback), `prompt`, and `description`, plus `run_in_background`, `model`,
  and `resume`; a call that carries `name` launches an agent-team teammate
  instead of a one-shot subagent.
- **Agent definitions.** `.claude/agents/*.md` (project) and
  `~/.claude/agents/*.md` (user), plus a plugin's `agents/` directory. A
  subdirectory is scanned but does not change identity. YAML frontmatter:
  `name` and `description` are required; `tools`, `disallowedTools`, `model`,
  `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`,
  `background`, `omitClaudeMd`, `effort`, `isolation`, `color`,
  `initialPrompt`, and `experimental` are optional. The body is the system
  prompt. The same files back the Claude plugin's `teammate:developer`,
  `teammate:reviewer`, `teammate:tester`, and `teammate:investigator`.
- **Config keys affecting agents.** `.claude/settings.json`: `permissions`
  (for example denying `Agent` to block delegation, or a tool rule scoped to
  a subagent), `agent` for the main-session agent, and `env`
  (`CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`,
  `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`,
  `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`). `--agents` takes a JSON
  definition per session.
- **Rendering.** `tm agents sync` copies the canonical markdown unchanged; its
  `name`, `description`, `tools`, and `model` fields are all valid Claude
  subagent frontmatter, so the rendering is sufficient.
- **Skills.** `.claude/skills`.
- **Instructions.** `CLAUDE.md` — **not** `AGENTS.md`. The installer writes the
  overlay's `AGENTS.md` content to `CLAUDE.md` for this harness.
- **Headless.** `claude -p`.
- **Background.** Supported; subagents run in the background by default
  (`run_in_background` can request it explicitly where fork mode is off).
- **Detection marker.** `CLAUDECODE` (best-effort).
- **Plugin.** The Claude plugin (see [PLUGIN.md](../../src/PLUGIN.md)) is the
  packaged form of this adapter for Claude Code and Cowork.

## pi

Verified against the current Pi docs (<https://pi.dev/docs/latest>:
`configuration.md`, `settings.md`, `extensions.md`) and the subagent example
extension in the `earendil-works/pi` source
(`packages/coding-agent/examples/extensions/subagent/`), which is the
authoritative definition of the `.pi/agents` convention.

- **Subagent tool.** `subagent`, **provided by an extension**, not by Pi. Pi
  has no native subagent tool; the example extension registers `subagent` and
  spawns a separate `pi` process per task with an isolated context. It supports
  three call shapes: single (`agent`, `task`), parallel (`tasks[]` of
  `{agent, task}`), and chain (`chain[]` with a `{previous}` placeholder),
  optionally `cwd`.
- **Agent definitions.** `.pi/agents/*.md` (project) and
  `<agent-dir>/agents/*.md` (user; `<agent-dir>` defaults to `~/.pi/agent`).
  YAML frontmatter: `name`, `description`, `tools` (a comma-separated string or
  a list), and `model`; the body is the system prompt. This directory is the
  extension's convention — native Pi discovers only extensions, skills,
  prompts, and themes.
- **Config keys affecting agents.** `.pi/settings.json` (and the agent-dir
  `settings.json`) has `packages`, `extensions`, `skills`, `prompts`,
  `themes`, and `defaultTools`; Pi itself has no agent-specific setting, so
  installing and configuring the subagent capability is done through the
  `extensions`/`packages` lists.
- **Rendering.** `tm agents sync` copies the canonical markdown unchanged; its
  `name`, `description`, `tools`, and `model` fields match the example
  extension's parser, so the rendering is sufficient for that extension.
- **Skills.** `.pi/skills`.
- **Instructions.** `AGENTS.md` (plus `CLAUDE.md`), discovered from the agent
  directory, the working directory, and parent directories.
- **Headless.** `pi -p`.
- **Background.** Extension-dependent; the example extension runs each task as
  a foreground child process and streams its output, so there is no native
  background default.
- **Detection markers.** `PI_CODING_AGENT_DIR`, `PI_SMOL_MODEL` (best-effort).

## omp

Verified against the installed `omp` v18.2.5 (`omp --version`, `omp --help`,
`omp agents --help`, `omp config list --json`, and `omp agents unpack`). "Oh My
Pi" is a Pi fork.

- **Subagent tool.** `task` ("Launch sub-agents for parallel tasks"). It accepts
  a flat call or a batch; `task.batch` defaults to `true`, so one call carries
  `{ context, tasks[] }`, one subagent per item, each optionally with its own
  `agent`. With `async.enabled` (default `true`) each spawn runs as an
  independent background agent.
- **Agent definitions.** `.omp/agents/*.md` (project) and
  `~/.omp/agent/agents/*.md` (user); `omp agents unpack [--project|--user]`
  writes the bundled ones there. Bundled agents are `task`, `scout`, `sonic`,
  `reviewer`, and `security-reviewer`. YAML frontmatter: `name`, `description`,
  `tools` (a list), `model` (a role such as `@smol`/`@slow`/`@task`, or a model
  id), `thinkingLevel`, `spawns` (allowed child agent types or `"*"`), `output`
  (a structured-output schema), and `prewalk`; the body is the system prompt.
- **Config keys affecting agents.** `config.yml` in the agent directory
  (default `~/.omp/agent/config.yml`) and `.omp/config.yml` for a project.
  `task.batch`, `task.maxConcurrency`, `task.maxRecursionDepth`,
  `task.disabledAgents`, `task.agentModelOverrides`,
  `task.agentServiceTierOverrides`, `task.agentPrewalk`, `task.agentAdvisor`,
  `task.prewalk`, `task.enableEffort`, `task.enableLsp`, `task.maxRuntimeMs`,
  `task.agentIdleTtlMs`, `task.softRequestBudget`, `task.maxEffort`,
  `task.eager`, `task.isolation.*`, `async.enabled`, `async.maxJobs`,
  `tier.subagent`, and `skills.enableAgentsUser`/`skills.enableAgentsProject`.
- **Rendering.** `tm agents sync` writes `tools` as a YAML list of omp tool ids
  (the canonical names lowercased) and maps each canonical model alias to an omp
  role: `sonnet` → `@task` (the general worker role the bundled `task` agent
  uses) and `opus` → `@slow` (the thorough role the bundled `reviewer` uses).
  omp's parser also accepts the canonical comma-separated `tools` string and a
  scalar `model`, but its own bundled agents use the list form, so the renderer
  emits that.
- **Skills.** `.omp/skills`.
- **Instructions.** `.omp/AGENTS.md`; omp loads `AGENTS.md` from `.omp/`
  directories (it also reads `.agent`/`.agents`, `~/.config/opencode/`, and
  `~/.codex/AGENTS.md` for compatibility).
- **Headless.** `omp -p`.
- **Background.** Supported and the default (`async.enabled`).
- **Detection marker.** `OMP_PROFILE` (checked before the `PI_*` markers omp may
  also carry; best-effort).

## Uncertainties

The matrix is honest about what is settled and what is not. Before a run,
confirm the adapter against the installed harness rather than trusting this
page.

- **Codex tool names are version-sensitive.** `spawn_agent`, `send_input`,
  `send_message`, `followup_task`, `resume_agent`, `wait_agent`, `list_agents`,
  `close_agent`, and `interrupt_agent` are read from the `openai/codex` `main`
  source; the official docs page names no tool, and the set has grown (v1 vs
  v2), so confirm the installed Codex's tool list.
- **OpenCode V1 and V2 differ.** V2 names the tool `subagent` and uses the
  `agents` key and a `permissions` array; V1 called the tool `task` and used
  `agent`/`permission`. This page names the V2 (installed v2.0.16) shapes, so a
  V1 session will not match the `subagent` name.
- **Pi requires an extension.** There is no native subagent tool; the
  `subagent` tool and the `.pi/agents` directory are the conventions of the
  bundled *example* extension. A different subagent package may register a
  different tool name or read a different directory, and background behavior is
  extension-dependent.
- **omp is verified only from the installed binary, not official docs.** The
  `task` call shape, `.omp/agents`, `.omp/config.yml`, and the `task.*` keys
  are read from `omp` v18.2.5 and may differ by version. `omp` writes its user
  config to `<agent-dir>/config.yml` (default `~/.omp/agent/config.yml`), not
  `.omp/config.yml`, which is the project-level file.
- **opencode and omp agent rendering is verified at the listing/schema level,
  not a full live launch.** `tm agents sync` now emits each harness's schema,
  and `opencode debug agents` (v2.0.16) confirms all four synced workers
  register as `mode: subagent` with the expected permissions; omp's schema is
  read from the parser bundled in the installed binary (v18.2.5). A true
  end-to-end launch of a synced worker (a model call through the harness's
  subagent tool) was not exercised here.
- **Claude's instruction file is `CLAUDE.md`, not `AGENTS.md`.** A reader who
  assumes one instruction filename across harnesses will be wrong for claude.
- **Detection is best-effort and unverified.** The environment markers above
  are not confirmed against a live environment (for example in a fresh shell or
  CI) and can be absent; pass `--harness` explicitly when it matters.

[Open question 6](14-open-questions.md) tracks the per-harness verification that
would turn these uncertainties into a tested table.
