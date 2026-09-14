---
name: run-rework
description: "Turn a failing review into a bounded fix loop that converges or stops: send only the open blocker and major findings back to the same worker, grouped by severity with file/line and the expected behavior, ban scope expansion, require the same report, then monitor and re-review until it passes or hits max_iterations. Use when a review returns a fail verdict with open blocker/major findings, when a rework round comes back still failing or regressed, or when the developer requests changes — not when only minor/nit findings remain."
---

# Run rework

A `fail` verdict is not the end of a task; it is the next instruction. Feed the
worker exactly what is wrong, in the least disruptive way, and repeat until the
work passes or the budget runs out. Bounding this loop is what stops a review
disagreement from quietly consuming the developer's time.

## When to use

- A review returns `fail` with at least one open `blocker` or `major` finding.
- A rework round came back still failing, or the fix introduced a regression.
- The developer asked for changes (request changes) on an otherwise complete
  task.

## When not to use

- Only `minor`/`nit` findings remain: document them in the report and proceed;
  they do not block a pass.
- The task is still running: `monitor-agents`.
- No review has run yet: `review-work` first — you cannot send findings you do
  not have.

## Inputs

- The open `blocker`/`major` findings recorded on the task
  (`python3 scripts/tm.py task show <id>`), each with severity, category, file,
  line, and suggestion.
- The same worker that wrote the change, and its task for the current iteration
  and `max_iterations`.

## Procedure

1. **Check the budget.** Compare the task's iteration with `max_iterations`
   (`python3 scripts/tm.py task show <id>`). At the limit, do not send another
   round — escalate with the full report and one question via
   `escalate-decision`.

2. **Write a feedback brief of findings only.** Pull the open findings from the
   ledger (`task show <id>`); group them by severity, `blocker` first, and for
   each give the file and line, what is
   wrong, and the behavior you expect. Keep out anything already fixed, any
   praise, and any new requirement. Close with the boundaries: fix only these
   findings, do not expand scope or touch unrelated files, re-run the project's
   own checks, and reply in the same `handoff-report` shape. Narrow, testable
   feedback is what keeps the next review about the fix rather than about
   discovering what else changed.

3. **Send it to the same worker.** It still holds the project context and the
   diff, so a new worker would only re-derive what this one already knows.

   ```bash
   python3 scripts/tm.py send "<name>" --brief "<feedback.md>" --wait --timeout <ms>
   ```

4. **Record the round.** This skill owns the iteration increment — `review-work`
   records only the verdict, so the two do not both increment.
   `python3 scripts/tm.py task update <id> --status rework --iteration <n+1>`.

5. **Monitor, then re-review.** Follow `monitor-agents` until the worker
   settles, then `review-work`. Collect fresh evidence every round — a diff
   from a previous iteration proves nothing about the current tree.

6. **Decide.** `pass` → `ready_for_approval`. `fail` → back to step 1 if the
   budget allows; otherwise escalate.

## Output

Either a converged pass or a bounded escalation with the full iteration history.

## Failure and escalation

- Non-convergence at `max_iterations`: escalate (`escalate-decision`) with the
  iteration history, the open findings, and one clear question.
- The same finding fails twice: the criteria or the brief may be wrong, not the
  worker. Escalate rather than repeat an identical round — a loop that cannot
  converge is the developer's call.
- The worker disputes a finding, or its fix would break scope: do not overrule
  it silently; escalate the disagreement with the evidence.
- The worker is blocked or failed: escalate; never impersonate it or answer its
  dialog. If the original worker is gone, re-delegate the findings with
  `delegate-task` only when its context can be recovered, otherwise escalate.
