---
name: review-change
description: "Review a diff against its acceptance criteria with fresh evidence: read the full changed files, run the project's own checks, record one actionable finding per observation with severity and category, and give a pass/fail/inconclusive verdict that names the checks run. Use when a completed change must be judged against agreed criteria — even if the request only says 'check this' or 'does this look right'."
---

# Review change

Review the work, not the summary. A report is a claim; the diff and the
project's own checks are the evidence.

This is the shared, read-only method. It changes nothing: no fixes, no commits,
no pushes, no comments on a remote. `verify-evidence` defines what counts as
evidence.

## When to use

- A completed change — a local diff, a branch, or a patch — must be checked
  against acceptance criteria.
- A reviewer worker is asked to judge another worker's output, or the primary
  must verify before approval.

## When not to use

- The task is still running: the primary waits for it to settle
  (`monitor-agents`).
- The assignment includes fixing the change: that is implementation, not review.
- You are deciding whether to review, spawning a reviewer, or driving rework:
  that coordination is the primary's (`review-work`), not this method.

## Inputs

- The goal and acceptance criteria for the change.
- The change itself: a local diff, a branch, or a patch.
- The project's check commands (from `load-project-context`).

## Fresh evidence

Collect evidence now. Never review from memory or reuse a diff snapshot from an
earlier iteration; the working tree may have moved.

1. Establish intent: the goal, every acceptance criterion, and the constraints
   from the request or brief. If criteria are missing, derive them from the goal
   and say what you assumed.
2. Read the diff — `git diff` and `git diff --staged`; for another agent's
   working copy use `git -C <root> diff`. As the primary,
   `python3 scripts/tm.py diff --cwd <root>` is also available; it lists
   untracked files, so read a new file's contents directly.
3. Read each changed file in full, not only the hunks; surrounding context
   decides whether a change is correct.
4. Run the project's own checks from its `AGENTS.md` / `CONTEXT.md`: tests,
   linters, type checks. Record the exact command and result.
5. Judge against the project's `AGENTS.md` conventions and acceptance bar, not
   just the presence of code. For a user-facing result, inspect the rendered or
   visible output — a screenshot or the built page — not only its source text.
6. Walk each acceptance criterion and mark it demonstrated, violated, or
   unverified.

## Findings

Record one observation per finding with a severity, category, title, detail,
file, line, suggestion, and status. The schema, categories, severity levels,
and verdict rules live in [references/findings.md](references/findings.md).

- Include only actionable findings. A concern about untouched code belongs in
  the verdict notes, not as a finding on the change.
- Treat a pasted command transcript as a claim, not evidence: re-run the
  decisive check yourself. A transcript with no run behind it, or one that does
  not match a fresh run, is a `blocker` finding for fabricated evidence.
- Do not pad the list with speculation or style preferences; noise buries the
  real defects.
- If generated or binary noise pollutes the diff, treat it as a project hygiene
  finding rather than blaming the author by default.

## Verdict

Name the checks you actually ran; the verdict rests on them.

- **pass** — every acceptance criterion holds and no open `blocker`/`major`
  remains. A pass with zero checks is a process failure, not a pass.
- **fail** — at least one open `blocker`/`major`.
- **inconclusive** — correctness cannot be determined, usually because evidence
  is missing or the change cannot be run.

## Output

A findings list and a verdict (`pass` / `fail` / `inconclusive`) that names the
criteria and the checks run. Return findings only; do not fix, commit, or
approve.

## Failure and escalation

- The project's checks cannot run, or evidence is missing — report
  `inconclusive`.
- `inconclusive`, a disputed finding, or a criterion that cannot be interpreted
  — hand it back to whoever requested the review instead of resolving it
  silently. As the primary that is `review-work`; as a reviewer worker it is the
  brief's requester.
- Never approve. Approval is the developer's decision, not the reviewer's.
