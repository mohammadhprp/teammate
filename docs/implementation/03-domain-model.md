# Domain model

The domain model is the contract between the tools, the orchestrator, and
storage. Define it with Effect `Schema` so records validate at both boundaries:
tool input and storage output.

## Identifiers

Use branded strings with recognizable prefixes. Prefixes make logs and storage
keys scannable and prevent accidental mixing.

```ts title="src/domain/task.ts"
import { Schema } from "effect"

export const TaskID = Schema.String.pipe(
  Schema.pattern(/^tsk_/),
  Schema.brand("TaskID"),
)
export type TaskID = typeof TaskID.Type

export const FindingID = Schema.String.pipe(Schema.brand("FindingID"))
export type FindingID = typeof FindingID.Type

export const makeTaskID = (): TaskID =>
  Schema.decodeSync(TaskID)(`tsk_${crypto.randomUUID()}`)
export const makeFindingID = (): FindingID =>
  Schema.decodeSync(FindingID)(crypto.randomUUID())
```

Session IDs come from OpenCode and already start with `ses`. Message IDs start
with `msg`.

## Task

A task is the unit of delegated work. It owns exactly one worker session in v1.

```ts title="src/domain/task.ts"
export const TaskStatus = Schema.Literal(
  "delegated",
  "working",
  "awaiting_review",
  "reviewing",
  "rework",
  "ready_for_approval",
  "approved",
  "rejected",
  "failed",
  "cancelled",
  "paused",
  "orphaned",
)
export type TaskStatus = typeof TaskStatus.Type

export const Task = Schema.Struct({
  id: TaskID,
  title: Schema.String,
  goal: Schema.String,
  context: Schema.optional(Schema.String),
  acceptanceCriteria: Schema.Array(Schema.String),
  constraints: Schema.optional(Schema.Array(Schema.String)),
  status: TaskStatus,

  originSessionID: Schema.String,
  projectID: Schema.optional(Schema.String),
  directory: Schema.String,

  worker: Schema.Struct({
    sessionID: Schema.String,
    agent: Schema.String,
    model: Schema.optional(
      Schema.Struct({
        providerID: Schema.String,
        id: Schema.String,
        variant: Schema.optional(Schema.String),
      }),
    ),
  }),

  iteration: Schema.Number,
  maxIterations: Schema.Number,
  lastReviewVerdict: Schema.optional(
    Schema.Literal("pass", "fail", "inconclusive"),
  ),
  lastWorkerOutcome: Schema.optional(
    Schema.Literal("succeeded", "failed", "interrupted"),
  ),
  error: Schema.optional(Schema.String),

  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
export type Task = typeof Task.Type
```

Field notes:

- **`originSessionID`** is the primary session that requested the work. The
  orchestrator sends review requests back to it.
- **`acceptanceCriteria`** drives the review. A worker cannot satisfy a task
  with no criteria, so the primary agent must supply at least one.
- **`iteration`** counts completed review cycles. When it reaches
  `maxIterations`, the task escalates instead of looping.
- **`lastWorkerOutcome`** maps to `Session.Info.outcome`, read after
  `session.wait`.
- **`error`** preserves a human-readable reason for `failed` and `orphaned`.

## Finding

A finding is one review observation. Findings are the payload of the feedback
loop.

```ts title="src/domain/task.ts"
export const FindingSeverity = Schema.Literal(
  "blocker",
  "major",
  "minor",
  "nit",
)
export type FindingSeverity = typeof FindingSeverity.Type

export const FindingCategory = Schema.Literal(
  "bug",
  "missing-requirement",
  "incorrect-behavior",
  "regression",
  "edge-case",
  "scope",
  "test-gap",
  "quality",
)
export type FindingCategory = typeof FindingCategory.Type

export const Finding = Schema.Struct({
  id: FindingID,
  severity: FindingSeverity,
  category: FindingCategory,
  title: Schema.String,
  detail: Schema.String,
  file: Schema.optional(Schema.String),
  line: Schema.optional(Schema.Number),
  suggestion: Schema.optional(Schema.String),
  status: Schema.Literal("open", "addressed", "disputed"),
})
export type Finding = typeof Finding.Type
```

The `category` enum mirrors the review checklist in
[Review and approval](07-review-and-approval.md).

## Review

A review records one primary-agent verdict over one worker result.

```ts title="src/domain/task.ts"
export const Review = Schema.Struct({
  id: Schema.String,
  taskID: TaskID,
  iteration: Schema.Number,
  verdict: Schema.Literal("pass", "fail", "inconclusive"),
  summary: Schema.String,
  findings: Schema.Array(Finding),
  workerOutcome: Schema.optional(
    Schema.Literal("succeeded", "failed", "interrupted"),
  ),
  diffStat: Schema.optional(
    Schema.Struct({
      files: Schema.Number,
      additions: Schema.Number,
      deletions: Schema.Number,
    }),
  ),
  reviewedAt: Schema.Number,
})
export type Review = typeof Review.Type
```

A `pass` verdict must not carry open `blocker` or `major` findings. The
`team_mate_submit_review` tool enforces this.

## Decision

A decision records the developer's final choice.

```ts title="src/domain/task.ts"
export const Decision = Schema.Struct({
  kind: Schema.Literal(
    "approve",
    "request-changes",
    "reject",
    "finalize",
  ),
  note: Schema.optional(Schema.String),
  decidedAt: Schema.Number,
})
export type Decision = typeof Decision.Type
```

`finalize` means the developer authorized the primary agent to commit or
otherwise complete the work. The plugin records the decision; the primary agent
performs the action with its normal tools.

## Timeline entry

The timeline is append-only and powers the transparency report.

```ts title="src/domain/timeline.ts"
export const TimelineKind = Schema.Literal(
  "task.created",
  "worker.prompted",
  "worker.idle",
  "worker.failed",
  "review.requested",
  "review.submitted",
  "feedback.sent",
  "approval.requested",
  "decision.recorded",
  "task.cancelled",
  "task.recovered",
)
export type TimelineKind = typeof TimelineKind.Type

export const TimelineEntry = Schema.Struct({
  at: Schema.Number,
  taskID: TaskID,
  kind: TimelineKind,
  summary: Schema.String,
  detail: Schema.optional(Schema.Unknown),
})
export type TimelineEntry = typeof TimelineEntry.Type
```

Timeline entries are small. Store large evidence, such as a diff snapshot, in a
separate record and reference it by key.

## Report

The report is assembled, not stored. Build it from a task, its reviews, its
timeline, and current VCS state.

```ts title="src/domain/task.ts"
export interface TaskReport {
  readonly requested: string
  readonly implemented: string
  readonly changedFiles: ReadonlyArray<{
    readonly file: string
    readonly additions: number
    readonly deletions: number
  }>
  readonly reviews: ReadonlyArray<Review>
  readonly issuesFound: number
  readonly issuesFixed: number
  readonly remainingConcerns: ReadonlyArray<Finding>
  readonly assessment: string
}
```

## Storage layout

Use one key per record with a stable prefix. This supports `scan` and avoids a
single large index record.

```text
task/<taskID>                     -> Task
task/<taskID>/review/<iteration>  -> Review
task/<taskID>/decision            -> Decision
task/<taskID>/timeline/<ts>-<n>   -> TimelineEntry
snapshot/<taskID>/<iteration>     -> diff snapshot (optional)
```

Reconstruct a task by scanning its prefix. Sort reviews and timeline entries by
their numeric suffix.

```ts
const taskPrefix = (id: TaskID) => `task/${id}`
```

## State machine

```text
delegated ──> working ──> awaiting_review ──> reviewing
                  ▲                               │
                  │                         ┌─────┴─────┐
                  │                       fail        pass
                  │                         │           │
                  │                         ▼           ▼
                  │                      rework   ready_for_approval
                  │                         │           │
                  │                         │      ┌────┴────┐
                  │                         │   approve   reject
                  │                         │      │        │
                  │                         │      ▼        ▼
                  └──── feedback ───────────┘  approved  rejected
```

Terminal states are `approved`, `rejected`, `failed`, and `cancelled`. `paused`
and `orphaned` are recoverable states set by the plugin across reloads.

Transition rules:

- Only `team_mate_delegate_task` creates a task in `delegated`, then `working`.
- The orchestrator moves `working` to `awaiting_review` when the worker is idle.
- `team_mate_submit_review` moves `reviewing` to `rework` or
  `ready_for_approval`.
- `rework` sends feedback and returns to `working`.
- `team_mate_decide` moves `ready_for_approval` to `approved` or `rejected`.
- Reaching `maxIterations` moves `reviewing` to `ready_for_approval` with
  remaining findings, regardless of verdict.

## Validation at boundaries

Validate tool input with the same schemas the store uses. Reject invalid input
before creating a worker session.

```ts title="src/domain/task.ts"
export const DelegateInput = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
  goal: Schema.String.pipe(Schema.minLength(1)),
  context: Schema.optional(Schema.String),
  acceptanceCriteria: Schema.Array(Schema.String).pipe(Schema.minItems(1)),
  constraints: Schema.optional(Schema.Array(Schema.String)),
})
export type DelegateInput = typeof DelegateInput.Type
```

If an encoded record fails to decode during recovery, log the key and skip it.
Do not let one corrupt record stop the orchestrator.
