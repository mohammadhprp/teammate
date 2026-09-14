---
name: independent-review
description: "Prevent an implementer from being the only judge of its own work: decide whether a result needs a separate reviewer worker, then spawn and brief that reviewer with the objective, acceptance criteria, and evidence — never the implementer's conclusion — and collect findings only. Use when the change is important or risky — auth, money, user data, migrations, public interfaces, concurrency, or parallel writers — when a criterion is hard to self-check, or whenever the developer asks for a second opinion — even if the implementer already reported success."
---

# Independent review

A worker's report is a claim from the worker that wrote the code. When a result
matters, someone who did not write it should judge it. This skill decides
whether that someone is a separate reviewer worker and, if so, creates and
briefs it. The reviewer applies `review-task`, the worker wrapper over the
shared `review-change` method, and returns findings; `review-work` keeps the
verdict and the loop.

## When to use

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
- Nothing has settled yet: wait with `monitor-agents` first.

## Inputs

- The persisted task (`python3 scripts/tm.py task show <id>`) for the goal,
  every acceptance criterion, and the current iteration.
- Fresh evidence — the diff and the project's own check commands — not the
  implementer's summary.
- The project root, so the reviewer can run its checks in context.

## Procedure

1. **Decide.** Judge the change against the risk list above and the
   self-check question; a trivial, low-risk change is reviewed in place, not by
   a separate worker. If `review_policy` is `never`, spawn no reviewer however
   risky the change looks — surface the risk to the developer with
   `escalate-decision`. Name the reason in the brief — a review you cannot
   justify is cost without value.

2. **Assemble evidence, not conclusions.** Collect the diff
   (`python3 scripts/tm.py diff --cwd "<root>"`), the changed files, and the
   commands that prove the criteria. Leave out the implementer's account of
   success: a reviewer anchored on "it works" tends to confirm it.

3. **Spawn the reviewer** with `delegate-task`, in the same project, as a
   worker distinct from the implementer. The ledger records one worker per
   task, so do not relink the task's worker field — `task find --worker` must
   still resolve the implementer. Spawn without `--task` and pass the task id
   inside the brief:

   ```bash
   python3 scripts/tm.py spawn --cwd "<root>" --project "<project>" --name "<reviewer>"
   ```

4. **Brief it to review, not to fix.** Give the reviewer the objective, every
   acceptance criterion, and the evidence paths. Tell it to apply `review-task`,
   judge the work rather than the summary, name the checks it runs, and return
   findings with a `pass`/`fail`/`inconclusive` verdict and no changes of its
   own. Send the brief with `delegate-task`.

5. **Collect** with `monitor-agents`, then read the reviewer's output
   (`python3 scripts/tm.py report "<reviewer>" --lines 300`). A verdict that
   names no checks run is not a pass.

6. **Return to the loop.** Hand the findings and verdict to `review-work`,
   which records the outcome and routes a `fail` to `run-rework`; an
   `inconclusive` verdict escalates.

## Output

Independent findings and a verdict from a reviewer that did not write the
change.

## Failure and escalation

- A reviewer that starts editing has left its role: stop it
  (`python3 scripts/tm.py stop "<reviewer>"`), keep its findings as input, and
  delegate the fix separately.
- `inconclusive`, or a reviewer and implementer who disagree on a finding: do
  not arbitrate in silence. Put the disagreement and its evidence to the
  developer with `escalate-decision`.
- Never let the implementer's own verdict stand in for this review.
