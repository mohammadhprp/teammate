---
name: report-progress
description: "Deliver the developer-facing report and request a decision: fill the shared handoff-report contract in templates/report.md, back every claim with evidence, and notify when notify is enabled. Use when work reaches a state the developer should see; whether that warrants an interrupt is `escalate-decision`'s call."
---

# Report progress

The developer should be able to tell what happened and what to decide without
reading a worker session. This skill is the developer-facing wrapper over the
shared `handoff-report` contract.

## When to use

- A task is ready for approval.
- A worker is blocked, failed, or the review loop is not converging.
- A consequential action — merge, push, publish, deploy, delete, or exposing
  secrets — needs the developer's approval.
- Work completes or is cancelled.

## When not to use

- Nothing important changed since the last report. Routine worker activity
  belongs to `monitor-agents`, not a developer report.

## Inputs

- The persisted task (`python3 scripts/tm.py task show <id>`): goal, criteria,
  iteration, verdict, and findings.
- The shared `handoff-report` contract and `templates/report.md`.
- `notify` from `team-mate.toml`, and the decision you are asking the developer
  to make.

## Procedure

1. **Assemble the report** with the `handoff-report` contract, filling
   `templates/report.md`. Read the persisted task with
   `python3 scripts/tm.py task show <id>` so
   the report reflects the recorded goal, criteria, iteration, and report
   rather than memory; let `handoff-report` govern the content — evidence
   behind every claim, remaining concerns stated honestly.
2. **Notify** when `notify` is true in `team-mate.toml`:

   ```bash
   python3 scripts/tm.py notify "Team Mate: <title>" --body "<status>" --sound request
   ```

3. **Ask for a decision** — approve, request changes, reject, or finalize —
   with one clear question, framed with `escalate-decision`, and record the
   answer with `python3 scripts/tm.py task decide <id> <decision>`. Do not
   commit, merge, or push without approval.

## Output

The developer report (per `templates/report.md`) and the requested decision.

## Failure

When the report cannot answer the decision you are asking for, say what is
missing and ask one clear question instead of burying it in prose; silence is
not consent.
