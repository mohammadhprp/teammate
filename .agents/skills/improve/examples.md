# Examples

## Repository-wide audit

**User:** Audit this repository and tell me what improvements are worth prioritizing.

**Expected behavior:** Recon the repository, inspect its verification commands and intent documents, audit the relevant categories, verify subagent findings, and return a concise evidence-backed findings table. Keep roadmap suggestions separate from defects. Ask which findings should become plans before creating plan files.

## Focused handoff plan

**User:** `plan` the migration from the legacy configuration loader to the new one. Include tests and a rollback path.

**Expected behavior:** Skip the broad audit, inspect the current loaders, callers, tests, and deployment conventions, then write one self-contained plan with exact paths, verification commands, scope boundaries, drift detection, rollback steps, and stop conditions.

## Request that belongs elsewhere

**User:** Review the changes in my pull request for authorization bugs and missing tests.

**Expected behavior:** Do not use `improve` for this narrow diff review. Decline the broad audit and review the pull request directly, combining it with `security-best-practices` when a security-only review is explicitly requested.
