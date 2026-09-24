---
name: report-result
description: "Close a worker task with the shared `handoff-report` shape — requested, implemented, changed, verified, issues, remaining concerns, assessment, decision — and state honestly what is unresolved. Use when a worker's assignment is finished or blocked and the primary needs a reviewable result, so review can start without a follow-up round-trip."
---

# Report result

Your report is the only part of the work the primary sees. A claim without
evidence cannot be accepted; a concern left out comes back as a review finding.
A complete, honest report is what lets review start without a follow-up.

This is the worker's wrapper over the shared `handoff-report` contract. Use that
shape, and make the report your final output so the primary can collect it.

## When to use

- The assigned work is finished and verified.
- The task is blocked and cannot proceed.

## When not to use

- Mid-task progress: the primary waits for the subagent to return; do not
  narrate.
- Nothing has changed since the last report.

## Inputs

- The confirmed criteria from `accept-assignment`.
- The change: the diff and the files touched.
- The evidence from `verify-change`, which applies `verify-evidence`.

## Procedure

1. **Verify first.** Never write the report before `verify-change`; the
   `Verified` section must come from real runs, not memory.
2. **Fill the `handoff-report` shape**, leaving nothing implied:
   - `Requested` — the goal and criteria as given.
   - `Implemented` — what was actually built, in scope terms.
   - `Changed` — the files, with additions and deletions.
   - `Verified` — claim + command + result, and what was not checked. Paste the
     raw output of a command you actually ran; never a constructed transcript.
   - `Issues found and fixed` — one line per finding.
   - `Remaining concerns` — anything unresolved, with severity; keep it out of
     prose.
   - `Assessment` — which criteria hold, and your confidence.
   - `Decision` — the primary's next step, e.g. "ready for review", or the
     question blocking you.
3. **Write the clean report, then make it your final output.** Write the full
   report as clean markdown to `.teammate-report.md` in the project root — no
   terminal chrome, no duplicated wrapped lines, no token/cost sidebar. That
   file is what the primary collects with `tm report`; also return the same
   report as your final message. Do not change the task's status or mark it
   approved — that is the primary's call.

## Output

An end-of-task report in the `handoff-report` shape, ready for the primary to
review.

## Failure and escalation

- A claim you cannot verify → mark it `inconclusive` in `Verified`; never imply
  success.
- A command you did not run → do not write it as a transcript. A pasted
  transcript with no run behind it is fabricated evidence and a `blocker`
  finding; say what you actually ran instead.
- Blocked → `raise-blocker` with one question, then report the blocked state.
