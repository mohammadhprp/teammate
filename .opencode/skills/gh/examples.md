# Examples

- Check `gh auth status` and repository context before performing GitHub operations.
- List open pull requests, inspect a specific PR with comments and checks, and summarize its status without changing remote data.
- Prepare a pull request from the current branch by reviewing commits and templates, then show the proposed title and body before creating it.
- Search issues with structured `--json` and `--jq` output, avoiding fragile parsing of terminal tables.
- Inspect a failed GitHub Actions run with `gh run view RUN_ID --log-failed` and summarize the relevant failure.
- Create or dispatch a workflow only after confirming the workflow, ref, and inputs with the user.
- Use `gh api` for an endpoint not covered by a subcommand, preferring read-only requests and requesting confirmation before mutations.
- Ask for explicit confirmation before pushing, merging, closing, deleting, rerunning, cancelling, or publishing remote resources.
