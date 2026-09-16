---
name: multi-project-context
description: "Resolve a task to exactly one project root and keep each project's context isolated, covering the workspace-per-project model. Use before delegating whenever a request names a project, spans or touches multiple repositories, uses an informal or ambiguous project name, or could route a worker's context into the wrong project."
---

# Multi-project context

One primary agent coordinates several independent projects, and context must
not leak between them. Resolve the project before delegating so every worker
sees exactly one project's context.

## When to use

- A request names a project, a repository, or several projects.
- A task spans repositories, or workers from different projects run at once.
- A project name is informal or ambiguous and must be mapped to a root.

## When not to use

- The project is already resolved for this task and its worker is running in it.

## Resolving a project

- Map each project to its root directory and its workspace label. The label
  defaults to the `--cwd` basename; pass `--project` to override it.
- Register the resolved project so its identity is durable, not re-typed:
  `python3 scripts/tm.py project add --name <name> --root <root>`. Use
  `python3 scripts/tm.py project list` to reuse a known root, and to catch a
  name that already points somewhere else — the registry refuses to rebind a
  name to a different root without `--force`.
- Before delegating, prepare it: `bootstrap-project` writes its `AGENTS.md` and
  installs the skills the work needs, so the worker starts with context.
- When the developer uses an informal name, or two projects look similar,
  confirm the resolved root before delegating. Do not guess.
- A task may touch several projects, but each worker still has one project
  scope. State explicitly which repository a cross-project worker may modify.

## Workspace and tab model

- The primary Team Mate agent runs in the `teammate` workspace
  (`primary_workspace` in `team-mate.toml`).
- Each target project has its own Herdr workspace named after the project; its
  workers run in tabs there.
- `python3 scripts/tm.py spawn --cwd <root> --project <name>` reuses the
  workspace with that label or creates it, then starts the worker in a new tab.
  Keep a project's workers out of other projects' workspaces and out of the
  primary `teammate` workspace.

## Context isolation

- A worker receives only its own project's `AGENTS.md`, `CONTEXT.md`, skills,
  scripts, and documentation. Its tab is created with `--cwd` set to the
  project root, so do not reuse a tab for another project's work.
- Never pass one project's files, secrets, or context into another project's
  worker.

## Context precedence

The precedence order — platform / system constraints, then Team Mate
coordination rules, then the target project's instructions, then task-specific
instructions — is defined in `load-project-context`.

## Output

Each task mapped to exactly one resolved project root and workspace label, with
no context crossing a project boundary.

## Failure and escalation

Confirm with the developer when a project is ambiguous, when a task would touch
repositories outside the stated scope, or when context would have to cross a
project boundary.
