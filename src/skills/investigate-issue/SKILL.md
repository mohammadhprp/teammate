---
name: investigate-issue
description: "Investigate a question about a codebase read-only: gather evidence from files, logs, history, and tests, separate a proven conclusion from a hypothesis, change nothing unrelated, and report the evidence with a confidence level. Use when a worker is delegated a diagnosis, root-cause, or feasibility question that does not include a fix — even when the wording is 'figure out why' and the cause looks obvious enough to fix on the spot."
---

# Investigate issue

An investigation earns trust by making its answer checkable, not by sounding
certain. The requester should be able to follow your evidence to your conclusion
and tell which parts are proven and which are still guesses.

This is read-only. If the assignment wants a fix, that is `implement-task`, and
the change must be verified separately; mixing the two contaminates the evidence
with the change you wanted to make. When you find the cause, stop and report it.

## When to use

- You are asked a question about the codebase: why something fails, how a
  behavior works, whether an approach is feasible, or where a value comes from.
- You are asked to diagnose something without a fix assignment.

## When not to use

- The assignment includes a fix — that is `implement-task`, then
  `verify-change`.
- The behavior is already understood and the fix is trivial — just make it.
- You are checking a completed change — that is `review-task` / `review-change`.

## Inputs

- The question, stated precisely enough to answer.
- The project root and context (see `load-project-context`).
- The relevant surface: source, tests, history, logs, configuration.

## Procedure

1. **Restate the question as something testable.** "Why does X fail?" becomes "X
   fails when Y; is the cause Z?" A testable question keeps the investigation
   from drifting into unrelated reading.
2. **Gather evidence, cheapest first.** Read the relevant code and tests; check
   history with `git log` / `git blame` for when behavior changed; reproduce the
   failure or run the test that exhibits it. Reproduce before theorizing whenever
   you can.
3. **Test the hypothesis against the evidence.** Follow the code and the run, not
   plausibility. `verify-evidence` applies here: a conclusion needs a check
   behind it, not a story.
4. **Separate conclusion from hypothesis.** Label what the evidence proves and
   what remains unconfirmed, naming the check that would confirm it.
5. **Change nothing unrelated.** Read-only: no drive-by edits, no fixes, no
   cleanup. If you must run something, leave the tree as you found it.
6. **Report evidence plus confidence.** Cite file and line, the command and its
   output, your confidence, and what would move it.

## Output

The question, the evidence, the conclusion, the confidence, and the open
questions — in the `handoff-report` shape, through `report-result`.

## Failure and escalation

- Cannot conclude → report the evidence gathered and the open questions rather
  than dressing a hypothesis as a finding; use `raise-blocker` if a decision is
  needed to continue.
- The investigation points to a fix that is in scope but unassigned → recommend
  it; do not perform it.
- The question cannot be answered as written → ask one clarifying question with
  `raise-blocker` instead of investigating the wrong thing.
