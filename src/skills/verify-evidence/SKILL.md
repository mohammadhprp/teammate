---
name: verify-evidence
description: "Prove a claim with the project's own checks and captured output before calling work done, and report `inconclusive` when it cannot be verified. Use whenever asserting a change works, or checking a worker's result; a summary is not evidence, a pass with zero checks is a process failure, and an unrun command transcript is fabricated evidence."
---

# Verify evidence

Completion is a state; correctness is a claim. "Done" means a command proved it,
not that an agent said so. The primary and its workers share this standard so
their reports can be trusted the same way.

## When to use

- Before asserting that a change works, passes, or fixes something.
- Before handing work back, or before accepting a worker's result.
- In any report that claims success.

## When not to use

- Never skipped for a claim that work is correct. A claim with no check is
  `inconclusive`, not done.

## Inputs

- The claim, stated precisely.
- The project's own check commands (from `load-project-context`).
- The change under test.

## Procedure

1. **Name the claim.** What exactly is asserted — which behavior, which
   acceptance criterion, which fix?
2. **Pick the project's check.** Use the project's own test, lint, build, or
   typecheck, or a reproduction that exercises the changed behavior. Prefer the
   real check over an ad-hoc substitute.
3. **Run it against the change's current state and capture the actual output.**
   Record the command and its real result, not a paraphrase or a restatement of
   intent. Paste the raw output. A transcript of a command that was not actually
   run is fabricated evidence: it is not a weak pass but a `blocker` finding,
   and a reviewer must re-run the decisive check rather than trust it. Evidence
   from before the last edit does not count.
4. **Read the result against the claim.** A green run that exercises nothing is
   a pass with zero checks — a process failure, not proof.
5. **Say what was not checked.** Name the gaps: edges not exercised, checks that
   could not run, behavior taken on trust.

## Output

Claim + command + result, ready to drop into a report's `Verified` section.

## Failure and escalation

- Cannot run the check, or cannot reproduce the behavior → report
  `inconclusive`. Never call it success.
- A failing check stays failed until a new run proves otherwise; do not
  rationalize it away.
- A command transcript with no run behind it is fabricated evidence → report it
  as a `blocker` finding and never a pass. The way to catch it is to re-run the
  decisive check; a transcript in the report is not a substitute for the run.

The shared standard is applied by `review-change`, required by `commit-changes`,
and used by the primary's `monitor-agents` before it trusts a settled worker.
