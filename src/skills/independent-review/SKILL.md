---
name: independent-review
description: "Prevent an implementer from being the only judge of its own work: once `review-work`'s gate warrants a separate reviewer, delegate that reviewer through the harness's subagent tool with the objective, acceptance criteria, and evidence — never the implementer's conclusion — and collect findings only. Use when the change is important or risky — auth, money, user data, migrations, public interfaces, concurrency, or parallel writers — when a criterion is hard to self-check, or whenever the developer asks for a second opinion — even if the implementer already reported success."
---

# Independent review

A worker's report is a claim from the worker that wrote the code. When a result
matters, someone who did not write it should judge it. Once `review-work`'s gate
decides a separate reviewer worker is warranted, this skill creates and briefs
it. The reviewer applies `review-task`, the worker wrapper over the shared
`review-change` method, and returns findings; `review-work` keeps the verdict
and the loop.

## When to use

`review-work` owns the gate: it decides whether to review and whether a separate
reviewer worker is warranted. This skill applies once that gate picks one.

- The change is important or risky — authentication, money, user data,
  migrations, public interfaces, concurrency, or parallel writers on shared
  files.
- A criterion is hard for the implementer to check honestly — its own
  assumptions, performance, security, or a subtle edge case.
- The developer asks for a second opinion, or the implementer disputes a
  finding.

## When not to use

- The change is trivial and low-risk: review it yourself with `review-change`.
  Independence is worth a second agent where a wrong result is expensive, not
  for a one-line config change.
- The work is already independently reviewed and only rework remains: see
  `run-rework`.
- Nothing has returned yet: wait with `monitor-agents` first.

## Inputs

- The persisted task (`python3 scripts/tm.py task show <id>`) for the goal,
  every acceptance criterion, and the current iteration.
- Fresh evidence — the diff and the project's own check commands — not the
  implementer's summary.
- The project root, so the reviewer can run its checks in context.

## Procedure

1. **Take the gate's decision.** `review-work` decides whether to review
   (`review_policy`) and whether a separate reviewer worker is warranted; once
   one is, this skill's job is to delegate and brief that reviewer, not to
   re-decide. Name the reason in the brief — a review you cannot justify is cost
   without value.

2. **Assemble evidence, not conclusions.** Collect the diff
   (`python3 scripts/tm.py diff --cwd "<root>"`), the changed files, and the
   commands that prove the criteria. Leave out the implementer's account of
   success: a reviewer anchored on "it works" tends to confirm it.

3. **Delegate the reviewer** with `delegate-task`, in the same project, as a
   worker distinct from the implementer. The ledger records one worker per
   task, so do not relink the task's worker field — `task find --worker` must
   still resolve the implementer. Delegate without its own task and pass the
   task id inside the brief. The harness's subagent tool call takes the brief
   as its prompt:

   ```bash
   python3 scripts/tm.py brief "<reviewer>" --task "<id>" <<'EOF'
   <review brief>
   EOF
   # call the harness subagent tool with the brief; do not link the task's worker
   ```

   A reviewer is normally delegated without its own task and owns no task. If
   the review itself must be tracked, ledger it as a `--kind review` task
   (`tm task new --kind review`); the findings and verdict still land on the
   **build** task, and the review task never enters the approval queue.

4. **Brief it to review, not to fix.** Give the reviewer the objective, every
   acceptance criterion, and the evidence paths. Tell it to apply `review-task`,
   judge the work rather than the summary, name the checks it runs, and return
   findings with a `pass`/`fail`/`inconclusive` verdict and no changes of its
   own. Persist the brief with `tm brief` and pass it as the subagent prompt
   (`delegate-task` owns the mechanics). Inline every fact — the reviewer is
   sandboxed to the project and cannot read a path outside it.

5. **Collect** when the subagent returns (`monitor-agents`), then read the
   reviewer's output (`python3 scripts/tm.py report "<reviewer>"`). A verdict
   that names no checks run is not a pass.

6. **Return to the loop.** Hand the findings and verdict to `review-work`,
   which records the outcome and routes a `fail` to `run-rework`; an
   `inconclusive` verdict escalates.

## Output

Independent findings and a verdict from a reviewer that did not write the
change.

## Failure and escalation

- A reviewer that starts editing has left its role: cancel it through the
  harness, keep its findings as input, and delegate the fix separately.
- `inconclusive`, or a reviewer and implementer who disagree on a finding: do
  not arbitrate in silence. Put the disagreement and its evidence to the
  developer with `escalate-decision`.
- Never let the implementer's own verdict stand in for this review.
