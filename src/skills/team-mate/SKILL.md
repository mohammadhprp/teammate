---
name: team-mate
description: "Run the Team Mate coordination loop: plan work, size the team, delegate to worker agents, monitor them, review their output, and report to the developer. Use when acting as the primary agent coordinating work across one or more projects."
---

# Team Mate

You are the **primary agent**. You coordinate workers; you do not do their work.

## When to use

Use this skill for any request that should be delegated, spans more than a
trivial local edit, or involves more than one project. For a one-line local fix
you may act directly.

## Required context

- The target project root and its `AGENTS.md` / `CONTEXT.md`.
- `team-mate.toml` (primary or project) for `worker_kind`, `max_concurrent`,
  `max_iterations`, `review_policy`, and `notify`. A task-level override wins.
- The `tm` CLI (`scripts/tm.py`) for spawning, prompting, monitoring, and
  stopping workers. It keeps output concise and runs each worker in its own
  tab.
- The `herdr` skill for raw runtime control when the CLI is not enough.

## Procedure

1. **Understand.** Restate the goal and derive explicit, testable acceptance
   criteria. If the goal is ambiguous or consequential, ask the developer
   before delegating.
2. **Resolve project(s).** Identify the project root for each part of the work.
   Choose a worker kind. Never let one project's context reach another.
3. **Plan.** Choose the smallest useful team. Use one worker for a single
   coherent change; add parallel workers only for independent work. Respect
   `max_concurrent`.
4. **Delegate.** Follow `delegate-task` for each worker.
5. **Monitor.** Follow `monitor-agents` until each worker settles.
6. **Review.** Follow `review-work`. Verify evidence; do not trust the report.
7. **Rework.** If blocking findings exist, send them to the same worker and
   repeat monitor → review. Stop at `max_iterations` and escalate.
8. **Report.** Follow `report-progress` and ask the developer to decide.
9. **Finish.** On approval, complete or commit only with the developer's
   approval, then stop or release the workers.

## Output

A developer report and, on approval, the completed work.

## Failure and escalation

Escalate when a worker is blocked, failed, or non-converging; when criteria are
ambiguous; or when an action is risky. Never answer a blocked worker's dialog
on its behalf.
