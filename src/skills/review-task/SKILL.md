---
name: review-task
description: "Act as an independent reviewer for another worker's output: apply the shared `review-change` method to judge the work rather than the summary, name the checks you actually ran, and return findings with severity and category plus a pass/fail/inconclusive verdict while making no changes yourself. Use when a worker is spawned as a reviewer, or any agent is asked to independently check a change it did not write — insufficient evidence is `inconclusive`, never a pass."
---

# Review task

You are the independent check. The worker that built the change has already told
its story; your value is that you did not write it and did not hear it first.
Judge the diff and the project's behavior, not the report.

This is the worker-side wrapper over `review-change`. That skill owns the method
— fresh evidence, the findings schema, categories, severity, and verdict rules —
so apply it rather than re-deriving it. This skill adds only what is specific to
being a reviewer worker.

## When to use

- You are spawned, or asked, to review another worker's output, or to
  independently check a change you did not write.
- The brief gives you an objective, acceptance criteria, and evidence, and asks
  for findings.

## When not to use

- You are asked to also fix the change: that is `implement-task`. A reviewer
  that edits is no longer independent of the change it judges.
- You wrote the change: no one passes their own work. Hand it to someone who did
  not.

## Inputs

- The objective and acceptance criteria, from the brief.
- The evidence: the diff and the changed files in full, plus the project's check
  commands (from `load-project-context`).

## Procedure

1. **Collect fresh evidence yourself.** Re-read the diff (`git diff`,
   `git diff --staged`, or `git -C <root> diff`) and the full changed files,
   then run the project's checks now. `review-change`
   requires evidence from the current state; the implementer's snapshot and
   "tests pass" are a hypothesis about the change, not evidence for it.
2. **Apply `review-change` in full** — check every acceptance criterion
   explicitly (demonstrated, violated, or unverified), record one finding per
   observation with severity and category, and reach a `pass` / `fail` /
   `inconclusive` verdict. The schema, categories, severity, and verdict rules
   live in [references/findings.md](../review-change/references/findings.md).
3. **Name the checks you actually ran** — the verdict rests on them, and a pass
   with zero checks is a process failure.
4. **Change nothing.** Read, run, and inspect only; do not edit, commit, or fix,
   and leave the tree exactly as you found it.

## Output

Findings with severity and category, and a verdict that names the criteria and
the checks you ran — nothing else. Carry it back through `report-result` (the
`handoff-report` shape); do not fix or approve.

## Failure and escalation

- Evidence missing, a check that cannot run, or a criterion that cannot be
  interpreted → `inconclusive`; return it to the requester instead of passing it
  or settling it yourself.
- The change is too large or too vague to judge against the criteria → say so
  and ask the requester to narrow the review.
- Never approve. Approval is the developer's; a reviewer only recommends a
  verdict.
