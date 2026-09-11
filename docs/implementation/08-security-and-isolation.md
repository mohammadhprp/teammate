# Security and isolation

Team Mate delegates code changes to autonomous agents. That creates two risks:
a worker making an unwanted change, and review evidence being ambiguous because
multiple agents touched the same checkout. This document defines the controls.

## Threat model

| Risk | Control |
| --- | --- |
| Worker performs a destructive action | Agent permissions, no auto-commit, review gate. |
| Worker exceeds its scope | Scoped brief, scope findings, review against criteria. |
| Worker reads or leaks secrets | Repository hygiene, environment review, least privilege. |
| Two workers corrupt each other's work | One active worker, or per-task worktrees. |
| Review approves incorrect work | Evidence-based checklist, no self-approval. |
| Runaway cost or loops | Concurrency and iteration limits. |
| Unwanted commits or pushes | Explicit `finalize` decision, worker prompt forbids VCS writes. |

## Permissions

OpenCode evaluates permissions from agent rules and session rules. Team Mate
relies on the configured `permissions` ruleset because the Effect plugin
context does not expose a permission domain or hook.

Each rule has an `action`, a `resource`, and an `effect` of `allow`, `deny`, or
`ask`.

```jsonc
{
  "agents": {
    "team-mate-worker": {
      "permissions": [
        { "action": "task", "resource": "*", "effect": "deny" },
        { "action": "team_mate_*", "resource": "*", "effect": "deny" },
        { "action": "edit", "resource": "**/*.pem", "effect": "deny" },
        { "action": "edit", "resource": ".env*", "effect": "deny" }
      ]
    }
  }
}
```

Recommendations:

- **Deny recursive delegation.** Deny the `task` action for workers.
- **Deny coordination tools.** Deny `team_mate_*` for workers so they cannot
  review or approve their own work.
- **Protect secrets.** Deny edits to credential files and environment files.
- **Require approval for risky actions.** Use `ask` for broad edits when the
  developer wants to stay in the loop.
- **Keep explicit denies final.** A configured `deny` is not overridable by a
  plugin.

Verify action names against the installed release. Tool action names match tool
names, and wildcard resource patterns use glob syntax.

### Permission hook gap

The Promise plugin API exposes a `permission.hook("evaluate")` that can review
decisions dynamically. The Effect plugin context does not expose this hook. If
dynamic policy is required, choose one of:

1. Encode the policy statically in agent permissions.
2. Add a separate Promise plugin that registers the permission hook and shares
   a small contract with Team Mate.
3. Revisit when the Effect plugin surface adds the permission domain.

Record the choice in [API mapping](10-api-mapping.md).

## Work isolation

### v1: one active worker per checkout

Run a single worker at a time against the working checkout. This keeps the VCS
diff attributable to one task.

- Set `maxConcurrentTasks` to `1`.
- Acquire the worker semaphore for the whole task lifetime.
- Collect the diff at review time and reset or verify the working tree before
  the next task.

Limitations:

- The developer must not edit the same checkout while a worker runs.
- The diff includes any pre-existing uncommitted changes. Warn the developer to
  start from a clean tree, or capture the base revision at delegation time and
  diff against it.

### Later: per-task worktrees

Isolate each task in its own Git worktree, then create the worker session at
that directory with `ctx.session.create({ location: { directory } })`.

The Effect plugin context does not expose a worktree domain. Options to create
the worktree:

1. Create it before delegation with the `git worktree` command through the
   shell domain, then pass the directory to `session.create`.
2. Use the HTTP worktree routes from a helper client.
3. Register a Promise worktree strategy in a companion plugin.

Recommendation: start with v1. Add worktree isolation only when concurrent
workers are required, because it adds lifecycle, cleanup, and diff-merge
complexity.

### Session location

`ctx.session.create` accepts a `location` of `{ directory, workspaceID? }`.
When a worktree exists, point the worker session at its directory. The worker's
relative paths, VCS root, and shell then resolve there.

## Change containment

- **No automatic VCS writes.** The plugin never commits, merges, pushes, or
  opens pull requests. The worker prompt forbids them. Only a developer
  `finalize` decision authorizes the primary agent to commit.
- **Bounded scope.** The worker prompt requires the smallest correct change and
  review flags scope creep.
- **Bounded iterations.** `maxReviewIterations` stops infinite rework.
- **Bounded concurrency.** `maxConcurrentTasks` caps simultaneous workers.
- **Interruptible work.** Workers are sessions. The developer can interrupt any
  worker at any time, and `team_mate_cancel_task` does it programmatically.

## Secrets and environment

Workers run with the same repository access as the developer. Treat the
checkout as untrusted input.

- Keep secrets out of the repository. Deny edits to `.env*` and key files.
- Do not inject secrets into worker prompts.
- Prefer environment variables from the host shell over files in the tree.
- Review shell output before it enters a report. The worker's report is
  model-generated; do not echo credentials into it.
- The plugin stores task state as JSON. Do not store diffs, file contents, or
  command output that may contain secrets. Store a diff stat and a snapshot
  reference only.

For stronger isolation, add a shell hook that redacts environment values or
blocks network access. The Effect plugin exposes
`ctx.shell.hook("create.before")`.

## Concurrency and attribution

Shared-checkout review is only trustworthy when the diff belongs to one task.
Guard this explicitly:

- Record the base revision at delegation time.
- At review time, diff against that revision, not just the working tree.
- If unrelated changes appear, mark the review `inconclusive` and ask the
  developer.

When concurrency is enabled, require worktree isolation so each task has its own
diff base.

## Auditability

The timeline is the audit log. It records delegation, worker outcome, review,
feedback, and decisions. Keep it append-only and free of secrets.

- Write one entry per state transition.
- Include the task ID and a short summary.
- Never delete timeline entries. Cancellation and rejection are entries too.
- The final report references timeline entries so the developer can trace the
  process.

## Operational limits

| Limit | Default | Purpose |
| --- | --- | --- |
| `maxConcurrentTasks` | 1 | Attribute diffs and bound cost. |
| `maxReviewIterations` | 3 | Bound rework loops. |
| Worker steps | Agent `steps` config | Bound per-turn tool use. |
| Session retention | OpenCode policy | Bound storage growth. |

Make every limit configurable and log when a limit is hit. A limit that fails
silently looks like a bug.
