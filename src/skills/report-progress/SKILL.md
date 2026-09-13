---
name: report-progress
description: "Assemble and deliver the developer report at approval, escalation, blockers, or completion, and raise a notification without flooding. Use when work reaches an important state or needs a developer decision."
---

# Report progress

Make coordination understandable without relaying every event.

## When to use

- A task is ready for approval.
- A worker is blocked, failed, or non-converging.
- A decision or a consequential action needs the developer.
- Work completes.

## When not to use

- Nothing important changed since the last report. Do not relay routine worker
  activity.

## Procedure

1. Assemble the report from `templates/report.md`. Pull the persisted task with
   `tm task show <id>` so the report reflects the recorded goal, criteria,
   iteration, and report rather than memory.
2. Back every claim with evidence: diff stat, files, commands run, results.
3. State remaining concerns honestly, including accepted minor findings.
4. If `notify` is true in `team-mate.toml`, raise a desktop notification:

   ```bash
   python3 scripts/tm.py notify "Team Mate: <title>" --body "<status>" --sound request
   ```

5. Ask the developer to decide. Do not commit, merge, or push without approval.

## Report shape

```markdown
## Team Mate report: <title>

**Task:** <id>   **Status:** <status>   **Iterations:** <n> of <max>

### Requested        ### Implemented      ### Changed
### Reviewed         ### Issues found and fixed
### Remaining concerns                    ### Assessment
### Decision
```

## Output

The developer report and the requested decision.

## Failure

If evidence is missing, say so and report `inconclusive` rather than guessing.
Escalate blockers with one clear question instead of burying it in prose.
