---
description: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.
agent: plan
---

Summarize Changes $ARGUMENTS

Summarize uncommitted changes and flag risky patterns.

## Process

1. **Inspect working tree** - Run `git status` (staged and unstaged), `git diff --stat`, `git diff` (and `git diff --cached` for staged). Count files changed, insertions, deletions.

2. **Categorize changes** - Group files by type of change:
   - New files vs modifications vs deletions vs renames
   - By layer: config, migrations, controllers, models, views, tests, infrastructure

3. **Analyze risk** - Scan diffs for specific risk signals:
   - **Secrets**: API keys, tokens, passwords, connection strings in any file
   - **TODOs/FIXMEs**: incomplete work left behind
   - **Debug code**: `console.log`, `dd()`, `var_dump`, `print`, debug breakpoints
   - **Large diffs**: files with >100 changed lines (hard to review)
   - **Generated files**: lockfiles, compiled assets, build outputs in the diff
   - **Migration changes**: database migrations without corresponding model changes (or vice versa)
   - **Config changes**: environment config, .env, CI config changes
   - **Comment-only changes**: files changed only in comments (suspicious)
   - **Permission changes**: executable bit changes, ownership changes

4. **Summarize** - Present a clear summary: files changed, insertion/deletion counts, categorized by risk level.

## Output Format

```
## Summary
N files changed, +X/-Y lines

## Changes by Category
- **New**: file1, file2
- **Modified**: file3, file4
- **Deleted**: file5

## Risks
🔴 HIGH: [risk description] — file:line
🟡 MEDIUM: [risk description] — file:line
🔵 LOW: [risk description] — file:line

## Suggested Commit(s)
feat: description
```
