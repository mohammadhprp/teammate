---
name: load-project-context
description: "Read the target project's own instructions — AGENTS.md, CONTEXT.md, local skills, commands, and conventions — before acting in it, and resolve conflicts with the context precedence order. Use when starting any work in a project, before editing files, delegating, or verifying, and whenever project instructions may conflict."
---

# Load project context

Every project carries rules an agent cannot guess: its commands, its conventions,
its constraints. Reading them first prevents rework, and reading *only* the
target project's keeps one project's context from leaking into another's.

## When to use

- Before the first edit, review, delegation, or verification in a project.
- When instructions from different layers appear to conflict.
- When a task names or spans several projects.

## When not to use

- Continuing an already-loaded task in the same project.

## Inputs

- The project root, as named in the task or brief (the primary resolves it
  with `multi-project-context`).
- The task or assignment, so you know which context matters.

## Procedure

1. **Read the project's own instructions.** Start with its `AGENTS.md` and
   `CONTEXT.md`. These speak for the project; prefer them over your defaults.
2. **Find the local surface.** Local skills, commands, and scripts, plus the
   manifest or task runner that defines build, test, lint, and typecheck.
3. **Extract what governs this task.** The commands to run, the style and
   structure to follow, and any action the project forbids.
4. **Apply precedence.** When instructions conflict, the higher layer wins:
   1. platform / system constraints;
   2. Team Mate coordination rules;
   3. target project instructions;
   4. task-specific instructions.

Load only the target project's context. Never carry one project's files,
secrets, or conventions into another project's work.

## Output

The constraints, commands, and conventions that govern the task — short enough
to brief a worker with.

## Failure and escalation

- Missing `AGENTS.md` or `CONTEXT.md` is normal on first contact: name which are
  absent, and prepare the project with `bootstrap-project` before delegating,
  rather than falling back to guesses.
- A real conflict across layers: surface it and ask, rather than choosing
  silently.
