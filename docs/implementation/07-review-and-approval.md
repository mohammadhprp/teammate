# Review and approval

Completing a task is not the same as completing it correctly. Review is the
step that separates the two. This document defines how the primary agent
reviews worker output, how findings drive rework, and how the developer
approves the result.

## Review principles

- **Review the work, not the summary.** The worker's report is a claim. The
  primary agent inspects the repository independently.
- **Review against criteria.** Every acceptance criterion is checked
  explicitly.
- **Findings are actionable.** Each finding names the problem, the evidence,
  and a suggested fix.
- **Approval is the developer's.** The primary agent recommends; it does not
  approve.

## Review trigger

The orchestrator requests review when a worker session becomes idle. The
request arrives in the primary session as a queued synthetic message. See
[Orchestration](05-orchestration.md).

The review request contains:

- The task goal and acceptance criteria.
- The worker's structured report.
- The changed files and diff stat.
- The current iteration and limit.

The primary agent pulls fresh evidence with
`team_mate_get_task({ taskID, detail: "full" })` and inspects files directly.

## Review checklist

The primary agent checks each dimension and records findings. The categories
map to the `FindingCategory` enum.

| Category | Checks |
| --- | --- |
| `bug` | Incorrect logic, crashes, bad state, broken error paths. |
| `missing-requirement` | An acceptance criterion is not implemented. |
| `incorrect-behavior` | Implemented, but behaves differently than specified. |
| `regression` | Existing behavior broke. |
| `edge-case` | Empty, null, boundary, concurrent, or error inputs. |
| `scope` | Changes beyond or short of the requested scope. |
| `test-gap` | No test, or a test that does not assert the behavior. |
| `quality` | Naming, duplication, dead code, unclear structure. |

The review must also consider:

- Unexpected side effects.
- Inconsistencies with the requested scope.
- Work that does not actually satisfy the original task.

## Findings

A finding is one observation. Keep findings specific and testable.

```json
{
  "severity": "major",
  "category": "bug",
  "title": "Null project throws instead of returning empty list",
  "detail": "listProjects dereferences project.id without a null check.",
  "file": "src/projects.ts",
  "line": 42,
  "suggestion": "Return an empty array when project is null.",
  "status": "open"
}
```

### Severity

| Severity | Meaning | Blocks a pass? |
| --- | --- | --- |
| `blocker` | Unsafe, broken, or fails a criterion. | Yes |
| `major` | Correctness or requirement gap. | Yes |
| `minor` | Real issue with limited impact. | No |
| `nit` | Style or preference. | No |

### Verdict rules

- **`pass`** requires every acceptance criterion to hold and no open `blocker`
  or `major` findings. Minor findings may remain if they are documented.
- **`fail`** means at least one open `blocker` or `major` finding.
- **`inconclusive`** means the reviewer cannot determine correctness, usually
  because evidence is missing. Escalate to the developer.

The plugin rejects a `pass` verdict with open blocking findings.

## Evidence collection

Gather evidence before the verdict. Do not review from memory.

1. Read the diff with `ctx.vcs.diff({ mode: "working", context: 3 })`.
2. Read the changed files in full, not only the hunks.
3. Run the relevant tests or checks. Use the project's own commands.
4. Compare the implementation against each acceptance criterion.
5. Re-read the original request and constraints.

Evidence is captured in the review record as a diff stat and, optionally, a
stored snapshot for the timeline.

## Feedback loop

```text
Work
  ↓
Review
  ↓
Open blocker or major findings?
  ├── Yes → Feedback → Fix → Work
  └── No  → Ready for approval
```

On `fail`, the orchestrator sends only open findings to the worker. Each
feedback prompt:

- Lists findings grouped by severity.
- Names the file and line.
- States the expected behavior.
- Forbids scope expansion.
- Requires the same structured report.

The worker addresses the findings and becomes idle again, which triggers
another review. The loop continues until a pass, or until the iteration limit.

## Escalation

Escalate to the developer when:

- The iteration limit is reached.
- The verdict is `inconclusive`.
- The worker is blocked and needs a decision.
- The worker fails or is interrupted.
- A finding is disputed and blocks progress.

The escalation includes the full report and a clear question. Do not bury the
decision in prose.

## Approval

When review passes, the task moves to `ready_for_approval`. The primary agent
requests approval and presents the report in its own message. The plugin
returns the assembled report from `team_mate_request_approval` for convenience.

### Report format

The report is the durable, developer-facing summary. It answers the path from
request to approval.

```markdown
## Team Mate report: <title>

**Task:** tsk_...
**Status:** ready for approval
**Iterations:** 2 of 3

### Requested
<the original goal and acceptance criteria>

### Implemented
<what the worker built>

### Changed
<file list with additions and deletions>

### Reviewed
<what the primary agent checked and how>

### Issues found and fixed
- [major] <finding> — fixed in iteration 2
- [minor] <finding> — fixed

### Remaining concerns
- [minor] <finding> — accepted, not blocking

### Assessment
<the primary agent's recommendation and confidence>

### Decision
Approve, request changes, reject, or finalize.
```

### Decision handling

| Decision | Effect |
| --- | --- |
| `approve` | Task is `approved`. No further work. |
| `request-changes` | Task returns to `rework`. The worker receives the note. |
| `reject` | Task is `rejected`. Work stops. |
| `finalize` | Task is `approved`. The primary agent may commit or complete it. |

The plugin records the decision but does not commit, merge, or push. Finalizing
is a deliberate act by the primary agent with the developer's approval.

## Transparency

Every stage writes to the timeline. The developer can reconstruct the entire
history:

- `task.created` — what the developer asked for.
- `worker.prompted` — the brief the worker received.
- `worker.idle` / `worker.failed` — how the worker finished.
- `review.requested` — when review started.
- `review.submitted` — the verdict and findings.
- `feedback.sent` — what was sent back.
- `approval.requested` — when the report was presented.
- `decision.recorded` — what the developer chose.

The report is assembled from the timeline and the stored reviews. It is always
available through `team_mate_get_task`, `/report`, and the primary agent.

## Review quality safeguards

- **No self-approval.** A worker cannot pass its own work. Only the primary
  agent submits a review.
- **No rubber stamping.** A pass with zero checks is a process failure. The
  primary agent must name the checks it ran.
- **Bounded loops.** The iteration limit prevents endless rework.
- **Visible dissent.** `inconclusive` and disputed findings reach the
  developer instead of being resolved silently.
- **Fresh evidence.** Collect evidence at each iteration. Do not reuse a diff
  snapshot from a prior iteration as proof of the current state.
