---
name: commit-changes
description: "Turn approved, verified changes into atomic conventional commits that match the project: group related edits into one logical unit each, stage only the intended files, and keep behavior separate from formatting. Use when the developer has approved work and committing is in scope, when finalizing a task, or whenever a change must be split into commits — not for unverified, unapproved, or project-managed work."
---

# Commit changes

A commit is a durable claim about the repository. Commit only approved and
verified work, and make each commit one complete change a reviewer could
understand and revert on its own.

## When to use

- The developer has approved the work and the approved scope includes
  committing.
- A task is being finalized and its change should be recorded.

## When not to use

- The work is unverified or unapproved. Prove it with `verify-evidence` and get
  approval first.
- Committing was not authorized. Committing is a consequential action; a worker
  leaves the tree for the primary unless its brief says otherwise.
- The project commits itself — a release bot, a changelog generator, or a commit
  hook. Follow the project's process instead of bypassing it.

## Inputs

- The approved, verified change and the scope that was approved.
- The project's commit convention (from `load-project-context`).
- The evidence that the change works (from `verify-evidence`).

## Before you commit

1. Load the project's conventions with `load-project-context`: its commit
   format, scope vocabulary, and any commit hooks. The project's convention wins
   over the default below.
2. Confirm the evidence. Every change in the commit should be backed by
   `verify-evidence`; never commit a known failure.
3. Inspect what will actually be committed:

   ```bash
   git status --short
   git diff            # unstaged
   git diff --staged   # already staged
   ```

## Group changes into atomic commits

One commit, one logical unit. Group by intent rather than by file, and ask
whether each commit could be reverted alone.

- Keep a feature and its tests together; split a second concern into its own
  commit rather than folding it in.
- Commit formatting-only churn (a formatter rewriting lines you did not
  otherwise touch) separately from behavior, so the behavior diff stays
  readable.
- Leave generated noise out — `__pycache__`, build output, editor files, or
  lockfile churn you did not intend. If it is already tracked, fix the
  `.gitignore` or ask rather than committing it.

## Write the message

Use `type(scope): description` in the imperative, without a trailing period.
The subject says what the change does; the body explains why when the reason is
not obvious.

Types: `feat` (user-facing feature), `fix` (user-facing bug), `docs`, `chore`,
`refactor` (no behavior change), `test`, `perf`, `ci`.

Scope names the area touched (`skills`, `tm`, `auth`); omit it when the change
is project-wide.

```text
feat(skills): add commit-changes common skill
fix(tm): report orphaned workers on status
refactor(review-work): point at the shared review method
```

## Procedure

1. Group the changes into commits.
2. For each group, stage exactly its files:

   ```bash
   git add <path> <path>
   ```

   Never `git add -A` or `git add .`; that sweeps in unrelated and generated
   files and destroys the atomicity you just planned.
3. Commit with that group's message.
4. Repeat for each group; leave any change outside the approved scope
   uncommitted.
5. Show the result: `git log --oneline -n <N>`.

## Output

One or more commits, each with its message, and the resulting log.

## Failure and escalation

- Ambiguous grouping, or a message that would overstate the change — stop and
  present the plan before committing.
- A secret, credential, or `.env` value in the diff — do not commit it. Tell the
  developer immediately.
- No project convention is discoverable — use the default above only for a
  low-risk change, and ask before committing anything consequential.
