---
name: showcase-work
description: "Present finished work so a reader can judge it in seconds: lead with the outcome, show the smallest convincing artifact (command output, diff, diagram, screenshot, or one focused HTML view), and close with a single recommended next action. Use when a change or result is ready to show the developer or the primary, when a decision needs the evidence in front of them, or when they ask to see or understand what changed."
---

# Showcase work

The reader judges from what you show. Put the outcome and its evidence in front
of them before any explanation, then stop.

Take the detail from the `handoff-report` contract; this skill is only the
presentation layer, so pick the smallest view that lets the reader judge the
result. Keep prose short and place each visual next to the line it supports.

## When to use

- A finished change, a working fix, or an investigation result is ready to show.
- The developer asks to see or understand what changed.
- A decision needs the evidence in front of the reader.

## When not to use

- Nothing has changed, or the state is routine progress: that is the primary's
  `report-progress`.
- The result is not proven: verify it first with `verify-evidence`. A
  description is not a substitute for an artifact.

## Inputs

- The finished, verified result and its evidence.
- The `handoff-report` for the task, including its `Decision`.
- The reader and the decision they must make.

## Procedure

1. **Lead with the outcome.** One sentence: what now works, what changed, or
   what was found. Not the journey, not the reasoning.
2. **Show the smallest convincing artifact.** Choose the one view that answers
   the reader's next question. Evidence beats narration:

   | The point is… | Show… |
   | --- | --- |
   | "it works" | the exact command and its actual output |
   | "this changed" | a diff of the affected shape — code, file tree, call flow, or state |
   | "the shape moved" | a shallow before/after file tree |
   | "these interact" | a Mermaid sequence or flow diagram |
   | "it looks right" | a screenshot of the result |
   | too dense for one of these | one focused HTML view, then open it for the reader |

3. **Surface the decision.** Carry the `handoff-report`'s `Decision` into one
   recommended next action — approve, review this file, run this command, or
   nothing. If a decision is required, make it one clear question.
4. **Stop.** If the reader has to scroll to find the point, cut.

`examples.md` shows each of these views with a worked example.

## Output

A short developer-facing summary: outcome, the artifact that proves it, and one
recommended next action. Detail stays in the underlying `handoff-report`.

## Failure

- You cannot demonstrate the result — say so plainly and mark the evidence as
  missing. Do not dress a description up as proof.
- The change is not reviewable yet — show it once it can be judged, or route the
  blocker to the primary's `report-progress` instead of presenting partial
  work.
