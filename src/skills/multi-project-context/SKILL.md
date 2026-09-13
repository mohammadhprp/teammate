---
name: multi-project-context
description: "Resolve which project a task belongs to and keep project context isolated when one primary agent works across several projects. Use whenever a request names or spans multiple projects."
---

# Multi-project context

One primary agent may coordinate several independent projects. Context must not
leak between them.

## Workspace model

- The **primary** Team Mate agent runs in the `teammate` workspace.
- Each target project has its own Herdr workspace named after the project. Its
  workers run in **tabs** inside that workspace.
- `tm spawn --project "<project>"` reuses the workspace with that label, or
  creates it, then starts the worker in a new tab there.

## Resolving a project

- Map each project to its root directory and its workspace label (the project
  name). If the developer uses an informal name, confirm the resolved root
  before delegating. Do not guess between similar projects.
- Keep a project's workers out of another project's workspace and out of the
  primary `teammate` workspace.

## Context isolation

- A worker receives only its own project's `AGENTS.md`, `CONTEXT.md`, skills,
  scripts, and documentation.
- The worker's tab is created with `--cwd` set to the project root. Do not
  reuse a tab from another project for a different project's work.
- Never pass one project's files, secrets, or context into another project's
  worker.

## Context precedence

When instructions conflict, apply:

1. platform / system constraints;
2. Team Mate coordination rules;
3. the target project's instructions;
4. task-specific instructions.

## Cross-project work

A task may touch several projects, but each worker still has one project scope.
State explicitly which repositories a cross-project worker may modify.

## Escalate

Confirm with the developer when a project is ambiguous, when a task would touch
repositories outside the stated scope, or when context would have to cross a
project boundary.
