---
name: review
description: Review local Git changes, GitHub pull requests, or GitLab merge requests and produce a structured review.json artifact. Use this skill whenever the user asks for a code review, diff review, PR review, MR review, or production-readiness assessment. Use the gh skill for GitHub and the glab skill for GitLab; never publish review comments.
---

# Review Skill

Review the requested change and write the result to `review.json`. The review is
read-only: do not approve, request changes, comment, merge, push, or otherwise
modify remote repositories.

## Select the change source

Use the source explicitly named by the user. If it is not named, inspect the
current repository and ask when the target is ambiguous.

### Local changes

- Run `git status --short` and inspect staged and unstaged changes with
  `git diff`, `git diff --cached`, and the relevant branch comparison when
  needed.
- Review the working tree as it exists; do not checkout, reset, stash, or amend
  user changes.

### GitHub pull requests

- Read the `gh` skill before using GitHub commands.
- Confirm repository context with `git remote -v` or use `--repo OWNER/REPO`.
- Read metadata with `gh pr view NUMBER --json title,body,baseRefName,headRefName`.
- Read the patch with `gh pr diff NUMBER`.
- Use only read operations. Do not run `gh pr review`, `gh pr comment`, `gh api`
  mutations, or any other publishing command.

### GitLab merge requests

- Read the `glab` skill before using GitLab commands.
- Confirm repository context with `git remote -v` or use `-R OWNER/REPO`.
- Read metadata with `glab mr view NUMBER --output=json`.
- Read the patch with `glab mr diff NUMBER`.
- Use only read operations. Do not run `glab mr approve`, `glab mr note`, merge,
  or other mutating commands.

## Review process

1. Establish the change intent from the request, commit history, description,
   and diff. Focus findings on changed files and lines.
2. Read relevant repository guidance and contracts, including naming, testing,
   security, and performance standards when available.
3. Check correctness, edge cases, error handling, state transitions,
   compatibility, security, and meaningful performance risks.
4. Check maintainability, comments, and tests against the consuming
   repository's conventions. Treat changed comments and tests as review items.
5. Include only actionable findings. Put concerns about untouched code in the
   top-level body rather than attaching them to changed lines.
6. Classify findings as critical, important, suggestions, or nits. Do not block
   for speculative improvements or cosmetic preferences.

## Inline comments

Use inline comments only when the exact changed path, side, and line are
available in the reviewed diff. For annotated diffs, use `[OLD:n]` as `LEFT`,
`[NEW:n]` as `RIGHT`, and `[OLD:n,NEW:m]` as `RIGHT` line `m`. If an exact
location cannot be verified, put the finding in the top-level body.

Every inline comment must begin with one of:

- `🚨 [CRITICAL]`
- `⚠️ [IMPORTANT]`
- `💡 [SUGGESTION]`
- `🧹 [NIT]` (only with a concrete suggestion)

Keep comments concise, actionable, and limited to changed lines. Use a
`suggestion` block only when the replacement is exact and safe.

## Output contract

Write exactly one `review.json` with this shape:

```json
{
  "verdict": "APPROVE",
  "body": "## Overview\n...\n\n## Concerns\n...\n\nFound: 0 critical, 0 important, 0 suggestions\n\nApprove",
  "comments": []
}
```

- `verdict` is required and must be `APPROVE` or `REJECT`.
- `body` is required and must contain an overview, concerns, issue counts in
  the form `Found: X critical, Y important, Z suggestions`, and a final
  recommendation of `Approve`, `Approve with nits`, or `Request changes` that
  agrees with `verdict`.
- `comments` is required and must be an array. Use an empty array when no
  verified inline comment is appropriate.
- Paths are repository-relative. `side` and `start_side` are `LEFT` or
  `RIGHT`; `start_line` is used only for a multi-line range.

Before finishing, validate JSON and, when an annotated diff is available, run:

```sh
python3 .agents/skills/review/scripts/validate_review_json.py \
  --review-json review.json --diff pr_diff.txt
```

If that path is unavailable, run the validator from this skill's `scripts/`
directory. Then render the review for human inspection:

```sh
python3 .agents/skills/review/scripts/render_review.py \
  --review-json review.json --output review.html
```

The renderer creates a self-contained Excalidraw-inspired dark HTML report.
The final artifacts are `review.json` and `review.html`.
