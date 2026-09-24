---
name: review-work
description: "Coordinate review of delegated work: decide who reviews a returned worker's result, obtain an independent review or apply the shared review-change method yourself, record the verdict, and route a fail to run-rework. Use when a worker returns and its result needs checking, or when a rework round came back for another pass."
---

# Review work

Completion is not correctness, and you own the work you delegated. This skill
coordinates review — who reviews, what verdict is recorded, and what happens
when the work fails. The review method itself (evidence, findings, severity,
verdict rules) is shared with every other reviewer, so apply `review-change`
instead of re-deriving it here.

## When to use

- A worker has returned and its result must be checked against the acceptance
  criteria.
- `review_policy` in `team-mate.toml` requires review, or the change is
  important or risky enough that the implementer should not judge it alone.
- Rework came back and needs another pass.

## When not to use

- The task is still running: see `monitor-agents`.
- You only need the review method (findings, severity, verdict): that is
  `review-change`.

## Inputs

- The returned task from the ledger (`python3 scripts/tm.py task show <id>`): its
  goal, acceptance criteria, and iteration.
- The worker's fresh output — `report`, `diff`, and the project's own check
  commands (from `load-project-context`).
- `review_policy` from `team-mate.toml`, and the `review-change` method the
  reviewer applies.

## Procedure

1. **Assemble the review inputs.** Read the persisted task with
   `python3 scripts/tm.py task show <id>` for the goal, criteria, and iteration,
   then collect the worker's current output so the reviewer has fresh material:

   ```bash
   python3 scripts/tm.py report "<name>"
   python3 scripts/tm.py diff --cwd "<root>" --stat
   ```

2. **Choose the reviewer.** Read `review_policy`: under `always`, review every
   returned task; under `on-risk`, review important or risky changes; under
   `never`, review only what the developer asks. Apply `review-change` yourself,
   and follow `independent-review` to add a separate reviewer worker that
   applies `review-task` when it is warranted. The reviewer gets the objective,
   acceptance criteria, and evidence — not the implementer's conclusion — and
   returns findings only.

3. **Record the findings, then the verdict.** The findings schema, categories,
   severity levels, and pass/fail rules live in `review-change`'s
   [references/findings.md](../review-change/references/findings.md). Record the
   findings as data so rework reads the ledger rather than prose, and record only
   the verdict status; the iteration increment belongs to `run-rework`:

   ```bash
   python3 scripts/tm.py task findings <id> --file <findings.json>   # an object or an array
   python3 scripts/tm.py task update <id> --status ready_for_approval --report-file <f>  # pass
   python3 scripts/tm.py task update <id> --status rework --report-file <f>              # fail
   python3 scripts/tm.py task update <id> --verdict inconclusive --report-file <f>       # cannot determine
   ```

   `task show` renders the verdict and the open findings, so a resumed primary
   reads the same state the reviewer recorded. On an `inconclusive` verdict,
   record it and escalate to the developer (step 5); do not set
   `ready_for_approval` — the approval gate refuses a task whose verdict is not
   `pass`. On a pass, first close the findings that now hold — `task update` and
   `task decide` refuse a pass while an open `blocker`/`major` remains:

   ```bash
   python3 scripts/tm.py task resolve <id> --all      # findings fixed or accepted
   ```

   `<id>` is the **build** task: the findings and verdict belong to it, and a
   pass moves only that task to `ready_for_approval`. If the review worker is
   itself ledgered, its own task is `--kind review` and never enters the
   approval queue (`task-ledger`); a review is evidence for the build decision,
   not something the developer approves.

4. **Drive rework.** On `fail`, follow `run-rework` to send the open findings
   back and repeat monitor → review until it converges or `max_iterations` is
   reached.

5. **Escalate.** On the iteration limit, an `inconclusive` verdict, a worker
   that returned a question or failed, or a disputed finding that blocks
   progress, follow `escalate-decision`: include the full report and one clear
   question — the developer decides; you recommend.

## Output

A recorded verdict and either a converged pass or a bounded escalation.

## Failure

An implementer cannot pass its own work, and a `pass` with zero checks run is a
process failure. When evidence is missing, the verdict is `inconclusive`, not
`pass`.
