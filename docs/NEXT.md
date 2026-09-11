# Next steps

Current state: the plugin implements the full delegate, monitor, review,
rework, and approve loop in `src/`. Typecheck and the review-gate selfcheck
pass. `list_tasks` was smoke-tested through the running plugin.

## 1. Caller-specified worker directory

`delegate_task` needs an optional `directory`. The orchestrator creates the
worker session with `session.create({ location: { directory } })`, stores it
as the task directory, and scopes `vcs.diff` to it. Monitoring stays
API-based (`session.wait`, `session.get`, `session.context`). Defaults to the
current project directory when omitted.

## 2. Verify in a live OpenCode session

Reload the plugin and confirm the `team_mate` tools and the `team-mate` and
`team-mate-worker` agents resolve. Fix any config key drift against the
installed release (agents key, permission action names).

## 3. End-to-end smoke test

Delegate a trivial task, let the worker finish, submit a failing review with
one finding, confirm the worker reworks, then pass and approve. Check the
timeline in storage covers request to decision.

## 4. Continue the roadmap

See [implementation/09-roadmap.md](implementation/09-roadmap.md). Hardening
(recovery, cancellation, limits) comes before per-task worktree isolation.
