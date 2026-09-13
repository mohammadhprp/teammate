---
name: review-work
description: "Independently verify worker output against acceptance criteria: gather fresh evidence, record findings with severity and category, decide pass/fail/inconclusive, and drive rework. Use when a worker has settled and its result must be checked."
---

# Review work

Completion is not correctness. Verify the work; the worker's report is a claim.

## When to use

- A worker has settled and its result must be checked against acceptance
  criteria.
- Work is important enough to warrant independent verification.

## When not to use

- The task is still running: see `monitor-agents`.

## Evidence

Collect fresh evidence at every iteration. Do not review from memory.

1. Worker transcript: `tm report "<name>" --lines 300`.
2. Project changes: `tm diff --cwd "<root>"` and `tm diff --cwd "<root>" --stat`.
3. Read the changed files in full, not only the hunks.
4. Run the project's tests/checks with the commands from its `AGENTS.md`.
5. Check each acceptance criterion explicitly.
6. Re-read the original request and constraints.

Ignore generated or binary noise (for example `__pycache__`); if it pollutes
the diff, that is a project hygiene finding, not automatically a worker fault.

## Findings and verdict

Record one observation per finding with a severity, category, evidence, and a
suggestion. See [references/findings.md](references/findings.md) for the schema,
categories, severity levels, and verdict rules.

- **pass** — every acceptance criterion holds and no open `blocker`/`major`.
  Name the checks you ran; a pass with zero checks is a process failure.
- **fail** — at least one open `blocker`/`major`.
- **inconclusive** — correctness cannot be determined; escalate.

Record the result:

```bash
python3 scripts/tm.py task update <id> --status ready_for_approval|rework|rejected --report-file <f>
```

## Independent review

For important work, create a separate reviewer worker so the implementer is not
the only judge. Give the reviewer the objective, the acceptance criteria, and
the evidence, and ask for findings only.

## Rework

On `fail`, send only the open findings to the same worker: grouped by severity,
with file/line, expected behavior, a ban on scope expansion, and the same report
requirement. Then repeat monitor → review. Stop at `max_iterations`.

## Escalate

Escalate on the iteration limit, `inconclusive`, a blocked or failed worker, or
a disputed finding that blocks progress. Include the full report and one clear
question.
