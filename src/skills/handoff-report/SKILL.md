---
name: handoff-report
description: "Write the one structured report contract that closes a task or hands a result between the primary and its workers. Use whenever finishing work or handing off a result — a worker's end-of-task report or the primary's result report; back every claim with evidence from `verify-evidence` and state honestly what is unresolved."
---

# Handoff report

One shape for reporting work, used by both roles. A reader should be able to act
on it without opening the session or trusting a summary — which only works if
the report separates what was asked, what changed, and what was actually proven.

## When to use

- Finishing a task, or handing a result from a worker to the primary.
- Reporting a meaningful state between roles.

## When not to use

- Nothing important changed since the last report.

## Inputs

- The goal and acceptance criteria.
- The change: diff and changed files.
- The evidence from `verify-evidence`.
- Open issues and unresolved concerns.

## Report shape

Fill every section; leave nothing implied.

```markdown
### Requested
<goal and acceptance criteria, as given>

### Implemented
<what was actually built, in scope terms>

### Changed
<files, with additions and deletions>

### Verified
<claim + command + result; and what was not checked>

### Issues found and fixed
- [severity] <finding> — fixed, or why not

### Remaining concerns
- [severity] <finding> — accepted or open

### Assessment
<does it meet the criteria; confidence; verdict>

### Decision
<the next action the reader must take, or "none">
```

The primary's `report-progress` renders this contract for the developer through
`templates/report.md`.

## Procedure

1. Fill the shape from facts, not memory.
2. Back every claim in `Verified` with the command and its captured output. A
   claim you cannot back is `inconclusive`; say so rather than omit it.
3. Carry unresolved items into `Remaining concerns`; never hide them in prose.
4. Make `Decision` the single next step the reader owns, or `none` when the work
   is complete.
5. Leave clean markdown, not a pane capture. When a worker writes a report for
   the primary to collect, save the full report to `.teammate-report.md` in the
   project root and make it the final message as well; a rendered terminal pane
   is only the fallback.

## Output

A report a reader can act on directly.

## Failure and escalation

- Missing evidence → mark the relevant claim `inconclusive`; never imply
  success.
- An unresolved item that blocks the work → state it plainly and ask for the
  decision needed.
