---
name: debug-issue
description: "Separate a failure's cause from a guess: reproduce and capture the exact failure, test one hypothesis at a time, make the minimal root-cause fix, then prove the fix and the absence of regression with the project's own checks. Use whenever something fails without an obvious cause — a failing test, a broken command, a crash, a build error, a regression, a bug assigned to a worker, or a symptom that moved after an earlier fix — and whenever asked to 'fix this', 'debug this', or 'why is this broken'."
---

# Debug issue

A failure has a cause. A fix without one is a guess that moves the symptom and
leaves the cause live, so you never learn which change actually fixed it. This
loop separates the two: capture the failure first, test one hypothesis at a time
against evidence, fix the cause, then prove it.

Both the primary and its workers debug, so the loop is shared. It runs the same
whether the primary diagnoses a problem directly or a worker is assigned a bug
inside a project.

## When to use

- Something fails and the cause is not obvious: a failing test, a broken
  command, a crash, a build error, a regression, or reported behavior no one has
  explained.
- A worker is assigned a specific bug to fix in the target project.
- An earlier fix moved the symptom instead of removing it.

## When not to use

- The failure is trivial and already understood: make the fix directly, with no
  hypothesis to test.
- No fix is authorized and the ask is to explain or diagnose: that is
  `investigate-issue`, which returns evidence and a conclusion without changing
  code.
- The work is to build a specified change, not to chase a failure: that is
  `implement-task`.

## Inputs

- The failure: the exact command, the input, and the observed output.
- A way to run the failing behavior — the project's own test or check command
  where one exists.
- The project's conventions and commands, from `load-project-context`.

## Procedure

1. **Reproduce and capture the failure.** Reproduce before changing anything; an
   unreproduced failure cannot be fixed, and every later step reads back to this
   baseline.
   - Run the smallest command that shows the failure.
   - Capture the exact command, the input, and the raw output — error text, stack
     trace, failing assertion. Record it; a paraphrase loses the detail that
     names the cause.
   - Confirm it fails the same way twice. If it is intermittent, capture the
     conditions and rough frequency instead of papering over it.
   - Load the project's context (`load-project-context`) so the fix matches its
     patterns and you use its own commands.

   If you cannot reproduce it, stop and report it (see Failure and escalation).

2. **Test one hypothesis at a time.** Read before you edit: the failing code, its
   callers, its tests, and its recent history name the cause faster than trial
   and error.
   - State exactly one hypothesis from the captured evidence, in the form "X
     causes Y because Z".
   - Test it with the cheapest evidence that could disprove it — a narrower
     reproduction, a log line, a targeted read, a throwaway test — not by
     editing production code and hoping.
   - Record the result. If it is disproved, discard it and form the next from
     what you learned. Stacking several speculative edits at once destroys the
     one thing the loop gives you: knowing which change mattered.
   - Keep proven facts separate from assumptions, and say which is which.

3. **Make the minimal change.** Fix the root cause, not the visible symptom; a
   change that suppresses the symptom moves the failure and leaves the cause
   running.
   - Change as little as resolves the cause, in the project's existing style, so
     the fix is easy to review and revert.
   - Do not widen it into refactoring, dependency bumps, or cleanup the task did
     not ask for; unrelated churn hides the actual fix.
   - If the true cause is much larger than the task implies, stop and raise it
     rather than absorbing it silently (workers: `raise-blocker`).

4. **Verify the fix and the absence of regression.** A fix is proven, not
   declared; re-run the reproduction and the project's own checks, the way
   `verify-evidence` requires.
   - Re-run the original reproduction and capture the output: it must now pass.
   - Run the project's checks for the touched area — tests, lint, typecheck,
     build — and capture command and result.
   - Exercise the behavior around the change: edge cases, the error path, and the
     callers it touches.
   - Name what you did not check; a green run that exercises nothing is not
     proof.

   If a check fails, the fix is not done — never report an unverified fix as
   working.

## Output

- **Root cause** — the defect, with the evidence that proved it.
- **Fix** — the change made, and why it addresses the cause rather than the
  symptom.
- **Verification** — the reproduction now passing plus the project checks that
  ran, each as command and result, and what was not checked.

Carry it into the `handoff-report` shape (workers: `report-result`); the primary
renders it to the developer through `report-progress`.

## Failure and escalation

- **Cannot reproduce** — say so plainly, share the exact commands and inputs you
  tried, and ask for a reproduction: steps, environment, sample input. Never
  invent a fix for a failure you have not seen.
- **Hypotheses exhausted with no cause** — report the evidence and the open
  question instead of guessing; it may belong with `investigate-issue` or a
  second worker.
- **The fix exceeds the task or risks unrelated behavior** — stop and raise it
  (workers: `raise-blocker`). When the decision is the developer's, the primary
  raises it with `escalate-decision`.
- **A check cannot run, or the failure stays intermittent** — report
  `inconclusive`, never success.

The loop is what `verify-change` runs after a debugging assignment, and what
`review-change` expects to see proven when it reviews the fix.
