---
name: commit
description: Create atomic Git commits with conventional messages. Use this skill whenever the user asks to commit changes, create commits, or prepare commit messages.
---

# `commit` skill instructions

Create Git commits for the user's changes.

## Process

1. **Analyze and plan** - Review conversation history, run `git status -s` and `git diff`, determine if changes should be one or multiple logical commits, group related files, and draft conventional commit messages (`type: description`) in imperative mood focusing on why.
2. **Present plan** - List files for each commit, show commit messages with type prefix, and ask: "I plan to create [N] commit(s) with these changes. Shall I proceed?"
3. **Execute upon confirmation** - Use `git add` with specific files (never `-A` or `.`), create commits with planned messages, and show the result with `git log --oneline -n [N]`.

## Commit Message Format

Use conventional commit format: `type: description`

**Types:**
- `feat:` - New feature (user-facing)
- `fix:` - Bug fix (user-facing)
- `docs:` - Documentation only
- `chore:` - Maintenance, tooling, dependencies
- `refactor:` - Code restructuring without behavior change
- `test:` - Adding or updating tests
- `perf:` - Performance improvement
- `ci:` - CI/CD changes
