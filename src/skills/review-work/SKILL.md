---
name: review-work
description: "Independently review worker output against acceptance criteria: collect fresh evidence, record findings with severity and category, decide a verdict, and send rework feedback. Use when a worker has settled and its result must be checked."
---

# Review work

Completion is not correctness. Verify the work; the worker's report is a claim.

## Evidence (collect fresh, every iteration)

1. Worker transcript:
   `python3 scripts/tm.py report "<name>" --lines 300`.
2. Project working copy, using the project's own VCS:
   `python3 scripts/tm.py diff --cwd "<project-root>"` and `... --stat`.
3. Read the changed files in full, not only the hunks.
4. Run the project's tests/checks with the commands from its `AGENTS.md`.
5. Check each acceptance criterion explicitly.
6. Re-read the original request and constraints.

Ignore generated and binary noise (for example `__pycache__`); if it pollutes
the diff, that is a project hygiene finding, not automatically a worker fault.

## Findings

One observation each, specific and testable:

```json
{
  "severity": "major",
  "category": "bug",
  "title": "Null project throws instead of returning empty list",
  "detail": "listProjects dereferences project.id without a null check.",
  "file": "src/projects.ts",
  "line": 42,
  "suggestion": "Return an empty array when project is null.",
  "status": "open"
}
```

Categories: `bug`, `missing-requirement`, `incorrect-behavior`, `regression`,
`edge-case`, `scope`, `test-gap`, `quality`.

## Verdict

- **pass** — every acceptance criterion holds and no open `blocker`/`major`.
  Name the checks you ran; a pass with zero checks is a process failure.
- **fail** — at least one open `blocker`/`major`.
- **inconclusive** — correctness cannot be determined; escalate.

## Rework

On `fail`, send only the open findings to the same worker: grouped by severity,
with file/line, expected behavior, a ban on scope expansion, and the same
report requirement. Then repeat monitor → review. Stop at `max_iterations`.

## Independent review

For important work, create a separate reviewer worker so the implementer is not
the only judge. Give it the objective, criteria, and evidence.

## Escalate

Escalate on the iteration limit, `inconclusive`, a blocked or failed worker, or
a disputed finding that blocks progress. Include the full report and one clear
question.
