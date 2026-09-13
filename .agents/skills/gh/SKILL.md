---
name: gh
description: Expert guidance for using the GitHub CLI (gh) to work with repositories, issues, pull requests, Actions, releases, and the GitHub API from the command line. Use this skill whenever the user needs to perform a GitHub workflow or asks to use gh.
allowed-tools: Bash, Read, Grep, Glob
---

# GitHub CLI (`gh`) Skill

Use the official `gh` CLI for GitHub operations instead of manually constructing API requests or browser workflows when a supported command exists.

## When to Use This Skill

Invoke when the user needs to:

- Inspect, create, edit, review, merge, or close pull requests
- Search, create, edit, comment on, or close issues
- Inspect repositories, branches, releases, tags, or notifications
- View, rerun, cancel, or inspect logs for GitHub Actions workflows
- Create and manage releases
- Query or mutate GitHub resources through the API

## Prerequisites and Authentication

Verify that the CLI is installed before executing commands:

```bash
gh --version
```

Check the active account and token scopes:

```bash
gh auth status
```

If authentication is missing, use the interactive login flow:

```bash
gh auth login
```

For automation, prefer a short-lived `GH_TOKEN` or `GITHUB_TOKEN` environment variable. Never print, commit, or include token values in command output, issue bodies, pull requests, or logs.

## Repository Context

Most commands infer the repository from the current Git remote. Confirm context when it matters:

```bash
git remote -v
gh repo view --json nameWithOwner,defaultBranchRef
```

Use `--repo OWNER/REPO` when running outside a checkout or targeting another repository.

## Core Workflows

### Pull Requests

```bash
# List and inspect PRs
gh pr list --state open
gh pr view 123 --comments

# Create a PR after pushing the branch
git push -u origin HEAD
gh pr create --base main --title "Add feature" --body "Summary and testing notes"

# Review a PR
gh pr checkout 123
gh pr diff 123
gh pr review 123 --approve

# Merge only after the user has explicitly approved the merge
gh pr merge 123 --squash --delete-branch
```

Prefer `--body-file` for substantial descriptions and `--json` with `--jq` for reliable scripting. Before creating or updating a PR, inspect repository templates and existing branch commits when the workflow requires them.

### Issues

```bash
gh issue list --state open --assignee @me
gh issue view 123 --comments
gh issue create --title "Bug report" --body-file bug.md --label bug
gh issue comment 123 --body "Investigation is complete."
```

Use `--repo OWNER/REPO` for issues in another repository. Treat closing, reopening, editing, and deleting issues as mutating operations that require clear user intent.

### GitHub Actions

```bash
gh run list --limit 20
gh run view RUN_ID
gh run view RUN_ID --log-failed
gh run watch RUN_ID
gh workflow run workflow.yml --ref main
```

Confirm the workflow name, ref, and inputs before dispatching a workflow. Do not rerun or cancel runs without user authorization.

### Releases and Repositories

```bash
gh release list
gh release view v1.2.3
gh release create v1.2.3 --generate-notes
gh repo view OWNER/REPO
gh repo clone OWNER/REPO
```

Creating, editing, or deleting releases and repositories is destructive or externally visible; confirm the target and requested changes first.

## API and Scripting

Use structured output rather than parsing human-readable tables:

```bash
gh pr list --json number,title,state --jq '.[] | [.number, .title, .state] | @tsv'
gh api repos/OWNER/REPO/issues --paginate --jq '.[] | [.number, .title] | @tsv'
```

For API mutations, state the HTTP method and target before execution and ask for confirmation when the operation changes remote data:

```bash
gh api repos/OWNER/REPO/issues --method POST \
  -f title='Bug report' -f body='Details'
```

Use `gh <command> --help` and `gh api --help` when exact flags or endpoint behavior is uncertain. Prefer `--paginate` for collection endpoints and constrain fields with `--jq` to avoid exposing unnecessary data.

## Best Practices

1. Run `gh auth status` before diagnosing authentication failures.
2. Check `git status`, the current branch, and the remote before PR or release work.
3. Use `--repo OWNER/REPO` rather than changing directories solely to select a repository.
4. Use `--json`/`--jq` for scripts and `--body-file` for multiline content.
5. Confirm before pushing, merging, closing, deleting, dispatching, rerunning, or cancelling remote work.
6. Do not bypass branch protection or approval requirements unless the user explicitly requests it and has authority.

## Common Problems

- **`gh: command not found`** — Install GitHub CLI and verify it is on `PATH`.
- **Authentication or scope errors** — Run `gh auth status`, then `gh auth refresh` or `gh auth login` as appropriate.
- **Wrong repository** — Check `git remote -v` and pass `--repo OWNER/REPO` explicitly.
- **PR cannot merge** — Inspect `gh pr checks NUMBER`, mergeability, required reviews, and branch protection.
- **Workflow dispatch fails** — Confirm the workflow supports `workflow_dispatch`, the ref exists, and required inputs are supplied.
- **API returns 404** — Verify repository spelling and that the authenticated account can access it.

## Quick Reference

- `gh repo view` — View the current repository
- `gh pr list` / `gh pr view NUMBER` / `gh pr create` — Pull request workflows
- `gh issue list` / `gh issue view NUMBER` / `gh issue create` — Issue workflows
- `gh run list` / `gh run view ID` / `gh run watch ID` — Actions workflows
- `gh release list` / `gh release create TAG` — Release workflows
- `gh api ENDPOINT` — GitHub REST or GraphQL API access
