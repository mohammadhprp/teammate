# Tools

Tools are the primary agent's interface to Team Mate. The plugin registers them
in the `team_mate` namespace. Each tool validates input with Effect `Schema`,
sends a command to the orchestrator, and returns a compact result the model can
act on.

## Registration

Register all tools in one transform so the editor sees a consistent namespace.

```ts title="src/tools/index.ts"
import { Effect, Schema } from "effect"
import type { Context } from "@opencode/plugin/effect"

export const registerTools = (ctx: Context, store: Store, orch: Orchestrator) =>
  ctx.tool.transform((editor) => {
    editor.namespace({
      name: "team_mate",
      description: "Delegate work and track Team Mate tasks",
    })
    editor.add(delegateTool(orch))
    editor.add(listTasksTool(store))
    editor.add(getTaskTool(store))
    editor.add(submitReviewTool(orch))
    editor.add(sendFeedbackTool(orch))
    editor.add(requestApprovalTool(store))
    editor.add(decideTool(orch))
    editor.add(cancelTaskTool(orch))
  })
```

Use `codemode: true` only if a tool must be reachable from the Code Mode
sandbox. Coordination tools are not, so leave it off.

```ts
editor.add({
  name: "delegate_task",
  description: "Create a worker session and delegate a task",
  input: DelegateInput,
  output: DelegateOutput,
  execute: (input, context) =>
    Effect.gen(function* () {
      const { task, workerSessionID } = yield* orch.delegate(input, context.sessionID)
      return {
        output: {
          taskID: task.id,
          workerSessionID,
          status: task.status,
          message:
            `Task ${task.id} delegated. The worker is running in the ` +
            `background. Use team_mate_get_task to check progress.`,
        },
      }
    }),
})
```

## Execution context

The executor receives decoded input and a context. The core tool contract
provides `sessionID`, `agent`, and call identifiers. The Effect plugin surface
also exposes `progress` for streaming status.

Treat `context.sessionID` as the origin session. It identifies the primary
session that must receive review requests. Verify the exact field names against
the installed `@opencode/plugin` types before release.

```ts
interface ToolExecutionContext {
  readonly sessionID: string
  readonly agent: string
  readonly toolCallID?: string
  readonly assistantMessageID?: string
  readonly progress: (input: {
    readonly status: string
    readonly metadata?: Record<string, unknown>
  }) => Effect.Effect<void>
}
```

## Tool set

### `team_mate_delegate_task`

Creates a task and a worker session, then prompts the worker with a structured
brief.

```ts
const DelegateInput = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
  goal: Schema.String.pipe(Schema.minLength(1)),
  context: Schema.optional(Schema.String),
  acceptanceCriteria: Schema.Array(Schema.String).pipe(Schema.minItems(1)),
  constraints: Schema.optional(Schema.Array(Schema.String)),
})

const DelegateOutput = Schema.Struct({
  taskID: Schema.String,
  workerSessionID: Schema.String,
  status: Schema.String,
  message: Schema.String,
})
```

Executor responsibilities:

1. Enforce the concurrency limit. Return a clear failure when it is reached.
2. Create the worker session with the configured worker agent.
3. Persist the task with status `delegated`.
4. Prompt the worker with the brief from [prompts](#worker-brief).
5. Append a `task.created` timeline entry.
6. Return the task ID immediately. Do not wait for the worker.

Return quickly. The primary agent must remain responsive while workers run.

### `team_mate_list_tasks`

Returns a compact board of tasks and their status.

```ts
const ListTasksInput = Schema.Struct({
  status: Schema.optional(TaskStatus),
  limit: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
})

const TaskSummary = Schema.Struct({
  taskID: Schema.String,
  title: Schema.String,
  status: TaskStatus,
  iteration: Schema.Number,
  updatedAt: Schema.Number,
  summary: Schema.optional(Schema.String),
})
```

Default the limit to 20 and sort by `updatedAt` descending.

### `team_mate_get_task`

Returns the detail the primary agent needs to review, or a status view while
work is in progress.

```ts
const GetTaskInput = Schema.Struct({
  taskID: Schema.String,
  detail: Schema.optional(Schema.Literal("summary", "full")),
})
```

The `full` detail includes:

- The task goal and acceptance criteria.
- The worker session ID and current status.
- The latest worker report (the final assistant text, if available).
- The VCS diff stat and changed files for the task scope.
- All findings with their current status.
- The iteration count and remaining iterations.

Use `full` before calling `team_mate_submit_review`. The primary agent also has
normal file and shell tools to inspect the repository directly.

### `team_mate_submit_review`

Records the primary agent's review and routes the next step.

```ts
const SubmitReviewInput = Schema.Struct({
  taskID: Schema.String,
  verdict: Schema.Literal("pass", "fail", "inconclusive"),
  summary: Schema.String,
  findings: Schema.Array(FindingInput),
})
```

Executor behavior:

1. Reject a `pass` verdict that includes open `blocker` or `major` findings.
2. Persist a review for the current iteration.
3. On `pass`, mark the task `ready_for_approval` and ask the primary agent to
   request approval.
4. On `fail`, mark the task `rework`, send the findings to the worker, and
   return control. The worker resumes.
5. On `inconclusive`, escalate to the developer with the open questions.
6. Increment the iteration count. If the limit is reached, escalate regardless
   of verdict.

Keep the tool return short: a status line plus whether the loop continues.

### `team_mate_send_feedback`

Sends guidance to a worker outside a formal review. Use it for developer
comments or clarifications that arrive mid-task.

```ts
const SendFeedbackInput = Schema.Struct({
  taskID: Schema.String,
  summary: Schema.String,
  guidance: Schema.String,
})
```

The orchestrator prompts the worker with the guidance and sets the task back to
`working`.

### `team_mate_request_approval`

Marks the task ready for the developer. The primary agent then writes the report
in its own message. This tool records the event and returns the assembled report
text so the primary can include it.

```ts
const RequestApprovalInput = Schema.Struct({
  taskID: Schema.String,
})

const RequestApprovalOutput = Schema.Struct({
  taskID: Schema.String,
  report: Schema.String,
  remainingConcerns: Schema.Array(Finding),
})
```

No form is required. Approval is a conversational decision. The plugin records
it when the primary agent calls `team_mate_decide`.

### `team_mate_decide`

Records the developer's decision after approval was requested.

```ts
const DecideInput = Schema.Struct({
  taskID: Schema.String,
  decision: Schema.Literal(
    "approve",
    "request-changes",
    "reject",
    "finalize",
  ),
  note: Schema.optional(Schema.String),
})
```

Executor behavior:

- **`approve`** sets `approved`. No further work.
- **`request-changes`** sets `rework` and prompts the worker with the note.
- **`reject`** sets `rejected` and stops work.
- **`finalize`** sets `approved` and tells the primary agent it may commit or
  otherwise complete the work with its normal tools.

The plugin records the decision. It does not commit, merge, or push on its own.

### `team_mate_cancel_task`

Interrupts the worker and marks the task cancelled.

```ts
const CancelTaskInput = Schema.Struct({
  taskID: Schema.String,
  reason: Schema.optional(Schema.String),
})
```

Call `ctx.session.interrupt({ sessionID: task.worker.sessionID })`, then update
the task and append a timeline entry.

## Worker brief

The plugin builds the worker prompt from the task. Keep it structured and
self-contained so the worker never needs the developer to repeat the request.

```text title="src/prompts.ts"
You are the working agent for Team Mate task {taskID}.

## Goal
{goal}

## Context
{context or "None provided."}

## Acceptance criteria
{each criterion as a numbered item}

## Constraints
{constraints or "None."}

## Working rules
1. Inspect the repository before changing anything.
2. Implement the smallest change that satisfies the goal.
3. Validate with the project's tests or an equivalent check.
4. Do not commit, push, or open a pull request.
5. When you finish, end with a report in this exact shape:

   STATUS: succeeded | failed | blocked
   SUMMARY: <one paragraph>
   CHANGES: <files and what changed>
   VALIDATION: <commands run and results>
   CONCERNS: <anything the reviewer should check>
```

The plugin appends the brief to the worker session with
`ctx.session.prompt({ sessionID, text, delivery: "steer" })`.

## Tool output rules

- Return short, structured text. The model reads it, so favor facts over prose.
- Include the task ID in every result so the primary can act without a lookup.
- Never return the full diff as tool output. It is large and duplicated in the
  repository. Return a diff stat and let the primary read files directly.
- On failure, return an actionable message, not a stack trace.

## Namespacing

The effective tool name is `team_mate_<name>`, for example
`team_mate_delegate_task`. Dots in namespaces and unsupported characters in
tool names become underscores. The `team_mate` namespace keeps the tools
grouped in the model's tool list.
