# Review and approval

Completing a task is not the same as completing it correctly. Review separates
the two. This document defines how the primary agent reviews worker output, how
findings drive rework, and how the developer approves the result.

## Review principles

- **Review the work, not the summary.** The worker's report is a claim. The
  primary agent inspects the project independently.
- **Review against criteria.** Every acceptance criterion is checked
  explicitly.
- **Findings are actionable.** Each finding names the problem, the evidence,
  and a suggested fix.
- **Approval is the developer's.** The primary agent recommends; it does not
  approve.

## Review trigger

Review starts when a worker settles into `idle` or `done`, as observed through
Herdr (`herdr agent wait`, `herdr agent list`, `herdr agent get`). The primary
agent then pulls fresh evidence before deciding anything.

Before reviewing, the primary agent assembles:

- The task goal and acceptance criteria.
- The worker's reported result.
- The changed files and diff stat.
- The current iteration and limit.

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

A `pass` verdict must not include open blocker or major findings.

## Evidence collection

Gather evidence before the verdict. Do not review from memory.

1. Read the worker transcript with
   `herdr agent read <worker> --source recent-unwrapped --lines 120`.
2. Inspect the project's working copy with its own VCS, for example
   `git diff` for the full change and `git diff --stat` for the summary.
3. Read the changed files in full, not only the hunks.
4. Run the relevant tests or checks using the project's own commands.
5. Compare the implementation against each acceptance criterion.
6. Re-read the original request and constraints.

Evidence is recorded as a diff stat and, where useful, a note of what was run.

## Independent review

For important work, the primary agent may create a separate reviewer agent so
the worker is not the only judge of its own output. The reviewer receives the
objective, the acceptance criteria, and the evidence, and returns findings.
Independent review is optional and should be used when the task warrants it.

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

On `fail`, the primary agent sends only the open findings back to the worker.
Each feedback prompt:

- Lists findings grouped by severity.
- Names the file and line.
- States the expected behavior.
- Forbids scope expansion.
- Requires the same structured report.

The worker addresses the findings and becomes idle again, which triggers
another review. The loop continues until a pass, or until the iteration limit
from `team-mate.toml`.

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

When review passes, the task is ready for approval. The primary agent presents
the report in its own message and asks the developer to decide.

### Report format

The report is the durable, developer-facing summary. It answers the path from
request to approval. See `src/templates/report.md`.

### Decision handling

| Decision | Effect |
| --- | --- |
| `approve` | Task is approved. No further work. |
| `request-changes` | Task returns to rework. The worker receives the note. |
| `reject` | Task is rejected. Work stops. |
| `finalize` | Task is approved. The primary agent may commit or complete it. |

Finalizing is a deliberate act by the primary agent with the developer's
approval. Team Mate does not commit, merge, or push on its own.

## Transparency

The developer can reconstruct the task from the request, the worker prompts,
worker state changes, review findings, feedback, the approval request, and the
recorded decision. Whether this history is persisted, and where, remains an
R&D topic — see [Reporting and observability](06-reporting-and-observability.md).

## Review quality safeguards

- **No self-approval.** A worker cannot pass its own work.
- **No rubber stamping.** A pass with zero checks is a process failure. The
  reviewer must name the checks it ran.
- **Bounded loops.** The iteration limit prevents endless rework.
- **Visible dissent.** `inconclusive` and disputed findings reach the developer
  instead of being resolved silently.
- **Fresh evidence.** Collect evidence at each iteration. Do not reuse a diff
  snapshot from a prior iteration as proof of the current state.
