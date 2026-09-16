---
name: visual-report
description: "Render the developer-facing report as one self-contained HTML file they can open and judge by looking: lead with the outcome, then show the evidence the work demands — before/after screenshots for a UI change, before/after code or an input→output example for a logic change, a verification table, and the findings. Use when reporting a result to the developer and a short text report would make them scroll or trust a summary, especially when there is a UI to see or a behaviour best shown before/after; `report-progress` delivers it."
---

# Visual report

A developer judges a result by looking at it, not by reading a summary of it.
This skill turns the `handoff-report` into one HTML file, opened in front of
them, whose visuals are the evidence. The prose stays the caption.

It renders; it does not decide. `report-progress` owns when the developer is
told, and `handoff-report` owns what the report must contain.

## When to use

- A result is ready for the developer and a text-only report would hide the
  point — there is a UI to see, a behaviour best shown before/after, or a case
  best shown as a concrete input → output.
- `report-progress` is delivering the report and a visual is what makes the
  result judgeable in seconds.

## When not to use

- Routine progress, or a short factual update: that is text, via
  `report-progress` and `showcase-work`.
- The work is not verified: run `verify-evidence` first. A visual of unverified
  work is decoration, and a screenshot is not proof on its own.

## Inputs

- The `handoff-report` content for the task, taken from the ledger
  (`python3 scripts/tm.py task show <id>`) — not from memory.
- The evidence: the diff (`python3 scripts/tm.py diff --cwd "<root>"`), the
  changed files, and the project's own check commands with their real output.
- For a UI: the rendered result at a stated viewport — screenshots from
  `agent-browser` (or the project's own command), plus the HTML/contrast/a11y
  checks the project defines.
- This skill's `scripts/render_report.py` and `references/report-schema.md`.

## Procedure

1. **Assemble the content from facts.** Fill the `handoff-report` shape with the
   same evidence standard as `verify-evidence`. Do not render a claim you cannot
   show; an unproven item is stated as `inconclusive`, not illustrated.
2. **Pick the visual the work demands.** Choose per the point:
   - *"this is what the UI does now"* → before/after screenshots at a stated
     viewport, plus the rendered checks (HTML, contrast, a11y).
   - *"this logic changed"* → before/after code for the decisive hunk.
   - *"it handles this case"* → one concrete input → output example, or the
     exact test command and its output.
   - *"it works"* → a checks table: the command and its real output.
   - *"these are the problems"* → the findings table.
   - a dense result → several of the above in one file, each beside its claim.
3. **Capture the artifacts, and keep the command.** Save screenshots and any
   example output next to the manifest; note the exact command and viewport that
   produced each. Real artifacts only.
4. **Write the manifest** (see `references/report-schema.md`) with the sections,
   the blocks you chose, `checks`, and `findings`.
5. **Render and show it.** Write it under the reports directory so the path is
   stable, then print the path and open it for the developer:

   ```bash
   python3 <skill-dir>/scripts/render_report.py report.json \
     --out "<state_dir>/reports/<task>-visual.html"
   open "<state_dir>/reports/<task>-visual.html"   # xdg-open on Linux
   ```

   Record the path in the report and the ledger
   (`python3 scripts/tm.py task update <id> --report-file "<html path>"`), or
   screenshot the HTML to show it inline.
6. **Ask for the decision.** Carry the report's single `Decision` into one
   question, framed with `report-progress` / `escalate-decision`.

## Output

One self-contained HTML file path, plus the one-line summary and the decision
the developer owns. It opens offline: images are embedded, there is no network
and no side files.

## Failure and escalation

- **A screenshot cannot be captured** (no browser, offline, a headless failure)
  → render the code, example, or checks view instead and say plainly that the
  screenshot was not captured. The renderer shows a **not captured** placeholder
  for a missing artifact; never substitute a mock or a fabricated image.
- **Nothing verifiable to show** → do not render. Say what is missing and route
  the decision through `report-progress`.
- **A missing image path** is a finding, not a silent omission — it reaches the
  developer as a placeholder so the gap is visible.

Depends on: `handoff-report`, `verify-evidence`; delivered by `report-progress`.
