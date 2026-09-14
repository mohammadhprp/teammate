---
name: bootstrap-project
description: "Prepare a target project before delegating: use `find-skills` to install the skills the work needs, then create or update the project's `AGENTS.md` (and `CONTEXT.md`) with its stack, commands, conventions, and acceptance bar. Use before the first delegation into a project, when a new project has no `AGENTS.md`, when the work needs a capability the project lacks (for example web design, testing, or a framework), or when a worker's output was thin because the project's context was. Do this first, not after a bad result."
---

# Bootstrap a project

A worker can only be as good as the project it lands in. A fresh project has no
`AGENTS.md`, no conventions, and none of the skills the work needs — so the
worker guesses, the review has nothing to hold it to, and the result is generic.
Fix that *before* delegating: give the project its context and its skills.

## When to use

- Before the first delegation into a project, or any time a project has no
  `AGENTS.md`.
- When the work needs a capability the project does not have — web design,
  framework specifics, testing, deployment, and so on.
- When a worker's output was weak and the cause was a thin project context,
  rather than the worker.

## When not to use

- The project already has a solid `AGENTS.md` and the skills this work needs.
- A trivial, well-specified change in an established project.

## Inputs

- The resolved project root (`multi-project-context`).
- The work to be done, so you know which domain and stack matter.
- Any existing `AGENTS.md`, `CONTEXT.md`, and project skills
  (`load-project-context`).

## Procedure

1. **Resolve and read.** Pin the project root, then read what already exists:
   `AGENTS.md`, `CONTEXT.md`, local skills, and the commands. Never overwrite
   the developer's context; merge into it.

2. **Detect the work's domain and stack.** From the goal and the repository
   (manifests, file types, existing config), name the stack and the capabilities
   the work needs. "A landing page" needs visual design and front-end skill; "a
   CLI" needs testing and packaging — be specific about the query.

3. **Find skills with the Skills CLI.** Use the `find-skills` skill when it is
   available — it is the guide to `npx skills` — and check the skills.sh
   leaderboard first. Then search:

   ```bash
   npx skills find "<domain> <task>"
   ```

   Verify before recommending: install count (prefer 1K+, be wary under 100),
   source reputation, and the source repository. Do not pick on keywords alone.

4. **Install what the work needs, into the project.** Install project-scoped so
   the capability travels with the project and does not leak between projects;
   use global (`-g`) only for something broadly useful everywhere:

   ```bash
   cd "<project-root>"
   npx skills add <owner/repo@skill> -y
   ```

   Installing new skills is additive; if a candidate would replace an existing
   project skill, stop and ask instead. If nothing suitable exists, say so and
   proceed with the common and worker skills — do not install noise.

5. **Write or update `AGENTS.md`.** Fill `templates/project-AGENTS.md` with what
   you learned: purpose, stack, the real commands (install, build, test, lint,
   run), the conventions, and the acceptance bar — including how a user-facing
   result is judged. Keep any developer-authored sections; add what is missing.

6. **Create `CONTEXT.md` if missing.** A short file naming the project's
   architecture, key files, and how to work in it. Leave an existing one alone.

7. **Report.** State the skills installed, the files written or updated, and
   anything you could not determine — so the plan that follows is grounded.

## Output

A project that can accept work: its `AGENTS.md` and `CONTEXT.md` in place, and
the skills the job needs installed. Brief the worker with it and it will not
have to guess.

## Failure and escalation

- No suitable skill found: say so and continue with the common and worker
  skills; a missing skill is not a reason to stall.
- The project already has context that conflicts with what you would write:
  propose the change and let the developer decide; do not clobber it.
- A candidate skill would overwrite a project-owned one, or looks low-quality:
  do not install it; list it and ask.
