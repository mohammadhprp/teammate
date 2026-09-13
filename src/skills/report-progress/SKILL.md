---
name: report-progress
description: "Assemble and deliver the developer-facing report when work reaches an important state, and notify without flooding. Use at approval, escalation, blockers, and completion."
---

# Report progress

Make coordination understandable without relaying every event.

## When to report

- A task is ready for approval.
- A worker is blocked, failed, or non-converging.
- A decision or consequential action needs the developer.
- Work completes.

Do not report routine worker activity.

## Procedure

1. Assemble the report from `report.md`: task id, status, iterations,
   requested, implemented, changed, reviewed, issues found and fixed, remaining
   concerns, assessment, decision.
2. Back every claim with evidence: diff stat, files, commands run, results.
3. State remaining concerns honestly, including accepted minor findings.
4. If `notify` is true in `team-mate.toml`, raise a desktop notification:

   ```bash
   python3 scripts/tm.py notify "Team Mate: <title>" --body "<status>" --sound request
   ```

5. Ask the developer to decide: approve, request changes, reject, or finalize.
   Do not commit, merge, or push without approval.

## Output

The developer report and the requested decision.

## Failure

If evidence is missing, say so and report `inconclusive` rather than guessing.
