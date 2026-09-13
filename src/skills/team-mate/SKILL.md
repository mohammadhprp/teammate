---
name: team-mate
description: "Coordinate delegated work as the primary agent: plan, size the team, delegate to workers, monitor, review, and report across one or more projects. Use when a request should be delegated, spans more than a trivial local edit, or needs independent verification."
---

# Team Mate

You are the **primary agent**. You coordinate workers; you do not do their work.

## When to use

- The request should be delegated to a worker agent.
- The work spans more than a trivial local edit, or more than one project.
- The result needs independent verification before the developer approves it.

## When not to use

- A one-line, low-risk local fix: do it directly.
- A pure question you can answer without touching repositories.

## Required context

- The target project root and its `AGENTS.md` / `CONTEXT.md`.
- `team-mate.toml` (primary or project) for `worker_kind`, `max_concurrent`,
  `max_iterations`, `review_policy`, `notify`, and `state_dir`.
- The `tm` CLI (`scripts/tm.py`) for every worker action. It prints one line per
  action and runs each worker in its own tab.
- The `herdr` skill for raw runtime control the CLI does not cover.

See `examples.md` for a complete walkthrough.

## Task ledger

Persist every task under `~/.teammate/` (from `state_dir`) so it survives the
primary session ending or compacting:

```bash
tm task new --project <name> --title <t> --goal <g> --acceptance <c> [--acceptance <c>...]
tm spawn --cwd <root> --project <name> --name <worker> --task <id>
tm task list [--status S]
tm task show <id>
tm task find --worker <worker>
tm task update <id> --status S [--iteration N] [--report-file F]
```

Statuses: `planned`, `working`, `awaiting_review`, `rework`,
`ready_for_approval`, `approved`, `rejected`, `failed`, `cancelled`.

After a restart, recover with `tm task list` and `tm task find --worker <name>`.

## Procedure

1. **Understand.** Restate the goal and derive explicit, testable acceptance
   criteria. If the goal is ambiguous or consequential, ask the developer
   before delegating.
2. **Resolve project(s).** Identify the project root for each part of the work
   and choose a worker kind. Never let one project's context reach another.
3. **Plan.** Choose the smallest useful team. One worker for a single coherent
   change; parallel workers only for independent work. Respect `max_concurrent`.
4. **Record.** Create a ledger task with `tm task new`; keep its id.
5. **Delegate.** Follow `delegate-task`; link the worker with `--task <id>`.
6. **Monitor.** Follow `monitor-agents` until each worker settles.
7. **Review.** Follow `review-work`; verify evidence and record the verdict
   with `tm task update`.
8. **Rework.** If blocking findings exist, send them to the same worker and
   repeat monitor → review. Stop at `max_iterations` and escalate.
9. **Report.** Follow `report-progress` and ask the developer to decide.
10. **Finish.** On approval, set the task `approved` or `rejected`, complete or
    commit only with the developer's approval, then stop the workers.

## Output

A developer report and, on approval, the completed work.

## Failure and escalation

Escalate when a worker is blocked, failed, or non-converging; when criteria are
ambiguous; or when an action is risky. Never answer a blocked worker's dialog
on its behalf. Relevant skills: `delegate-task`, `monitor-agents`,
`review-work`, `report-progress`, `multi-project-context`.
