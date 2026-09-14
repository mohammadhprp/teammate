---
name: verify-change
description: "Self-verify your own change before handing it off: run the project's own checks, exercise the changed behavior at its boundaries, confirm no regression in touched areas, and capture the raw command output as evidence. Use whenever a worker believes its build is complete but has not yet reported it, and for any change about to leave your hands — never hand off a known failure, and treat an unexercised green run as a process failure, not proof."
---

# Verify change

A change is ready to hand off only when the project's own checks say so. This is
the worker-side application of the shared `verify-evidence` standard: that skill
defines what counts as evidence, and this one turns the standard into the
self-check to run before `report-result` carries the change to the primary.

Verify here because it is the cheapest place to catch a defect: every check
skipped now returns later as a `review-change` finding and a rework cycle.

## When to use

- You believe the build is complete and are about to hand it off (see
  `report-result`).
- The change has boundaries a happy-path run never reaches — empty, null, error,
  boundary, or concurrent inputs.
- You changed code that other behavior depends on and need to know you did not
  break it.

## When not to use

- Never skipped for a change that claims to work. If you cannot verify it, say
  so; do not report it as done.
- Mid-build, the checks belong to `implement-task` as you go; this is the
  deliberate final pass before reporting.

## Inputs

- The change: the diff and the files it touches.
- The claim it must satisfy: the acceptance criteria.
- The project's own check commands, from `load-project-context`.

## Procedure

1. **Run the project's own checks.** Use the test, lint, build, and typecheck
   commands the project defines in its `AGENTS.md` / `CONTEXT.md`. The project's
   command is the authority; an ad-hoc substitute only counts when the project
   has none, and then say so.
2. **Exercise the changed behavior at its boundaries.** Drive the inputs the
   happy path avoids — empty, null, boundary, error, and concurrent cases. The
   defect usually lives where the happy path does not go. Reuse the project's
   test framework where it fits, or write a focused reproduction.
3. **Confirm no regression in touched areas.** Run the checks nearest the
   change, not only the ones you added; a change to shared code is verified by
   its consumers' checks too.
4. **Capture the raw output.** Record the exact command and its actual result,
   not a paraphrase of intent. Evidence from before your last edit does not
   count; re-run after every change.
5. **Separate proven from assumed.** Name what you did not check.
   `verify-evidence`'s rule applies to your own run: a suite that never touched
   the change is a pass with zero checks, not proof.

## Output

A claim + command + result set ready to become the `Verified` section of the
`handoff-report` — plus the list of what was not checked.

## Failure and escalation

- A check fails → fix it. If it is out of scope or you cannot fix it, hand it to
  `raise-blocker`; never report a known failure as done.
- A check cannot run → say so and mark the claim `inconclusive` in the report
  rather than assuming a pass.
- The change works only under conditions you had to invent → that is a gap in
  the brief; raise it instead of inventing acceptance criteria.
