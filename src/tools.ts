import { Tool } from "@opencode/schema/tool"
import { Effect, Ref, Schema } from "effect"
import type { Ctx, SessionID, Task } from "./domain"
import { captureReport, diffSummary, type Options, type Orchestrator } from "./orchestrator"
import { formatFindings } from "./prompts"
import type { Store } from "./store"

const DelegateArgs = Schema.Struct({
  title: Schema.String,
  goal: Schema.String,
  context: Schema.optional(Schema.String),
  acceptanceCriteria: Schema.Array(Schema.String),
  constraints: Schema.optional(Schema.Array(Schema.String)),
})

const ListArgs = Schema.Struct({
  status: Schema.optional(Schema.String),
})

const GetArgs = Schema.Struct({
  taskID: Schema.String,
  detail: Schema.optional(Schema.Literals(["summary", "full"])),
})

const FindingArgs = Schema.Struct({
  severity: Schema.Literals(["blocker", "major", "minor", "nit"]),
  category: Schema.String,
  title: Schema.String,
  detail: Schema.String,
  file: Schema.optional(Schema.String),
  line: Schema.optional(Schema.Number),
  suggestion: Schema.optional(Schema.String),
})

const ReviewArgs = Schema.Struct({
  taskID: Schema.String,
  verdict: Schema.Literals(["pass", "fail", "inconclusive"]),
  summary: Schema.String,
  findings: Schema.Array(FindingArgs),
})

const FeedbackArgs = Schema.Struct({
  taskID: Schema.String,
  guidance: Schema.String,
})

const DecideArgs = Schema.Struct({
  taskID: Schema.String,
  decision: Schema.Literals(["approve", "request-changes", "reject", "finalize"]),
  note: Schema.optional(Schema.String),
})

const CancelArgs = Schema.Struct({
  taskID: Schema.String,
})

const board = (all: Task[]): string => {
  if (!all.length) return "No Team Mate tasks."
  return all
    .map((task) => `${task.id} [${task.status}] ${task.title} (iteration ${task.iteration})`)
    .join("\n")
}

export const registerTools = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  orchestrator: Orchestrator,
  options: Options,
) =>
  ctx.tool.transform((editor) => {
    editor.namespace({ name: "team_mate", description: "Delegate work and track Team Mate tasks" })

    editor.add({
      name: "delegate_task",
      description:
        "Create a worker session and delegate a scoped task. Provide a goal and at least one acceptance criterion.",
      input: DelegateArgs,
      execute: (input, context) =>
        orchestrator.delegate(input, context.sessionID).pipe(
          Effect.map((result) => ({
            content: `Task ${result.taskID} delegated to worker session ${result.workerSessionID}. The worker runs in the background; use team_mate_get_task to check progress.`,
            metadata: {
              taskID: result.taskID,
              workerSessionID: result.workerSessionID,
              status: result.status,
            },
          })),
        ),
    })

    editor.add({
      name: "list_tasks",
      description: "List Team Mate tasks and their status.",
      input: ListArgs,
      execute: (input) =>
        Ref.get(tasks).pipe(
          Effect.map((map) => {
            const all = [...map.values()].filter(
              (task) => !input.status || task.status === input.status,
            )
            return { content: board(all), metadata: {} }
          }),
        ),
    })

    editor.add({
      name: "get_task",
      description:
        "Get a Team Mate task. Use detail full before reviewing to include the worker report and working-copy diff.",
      input: GetArgs,
      execute: (input) =>
        Effect.gen(function* () {
          const task = yield* Ref.get(tasks).pipe(Effect.map((map) => map.get(input.taskID)))
          if (!task) {
            return yield* Effect.fail(new Tool.Error({ message: `Unknown task ${input.taskID}.` }))
          }
          const base = [
            `Task: ${task.id}`,
            `Title: ${task.title}`,
            `Status: ${task.status}`,
            `Goal: ${task.goal}`,
            `Acceptance criteria:\n${task.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`,
            `Worker session: ${task.workerSessionID}`,
            `Iteration: ${task.iteration} of ${task.maxIterations}`,
            `Report:\n${task.report ?? "(none yet)"}`,
          ]
          if (input.detail !== "full") {
            return { content: base.join("\n"), metadata: { taskID: task.id, status: task.status } }
          }
          const report = yield* captureReport(ctx, task.workerSessionID as SessionID)
          const diff = yield* diffSummary(ctx)
          const reviews = yield* store.listReviews(task.id)
          const findings = reviews.flatMap((review) => review.findings)
          return {
            content: [
              ...base,
              `Latest worker report:\n${report || "(none)"}`,
              `Working-copy changes:\n${diff}`,
              `Findings so far:\n${formatFindings(findings)}`,
            ].join("\n\n"),
            metadata: { taskID: task.id, status: task.status },
          }
        }),
    })

    editor.add({
      name: "submit_review",
      description:
        "Record your review of a task. A pass verdict requires no open blocker or major findings.",
      input: ReviewArgs,
      execute: (input) =>
        Effect.gen(function* () {
          yield* orchestrator.submitReview(input)
          const task = yield* Ref.get(tasks).pipe(Effect.map((map) => map.get(input.taskID)))
          const status = task?.status ?? "unknown"
          const next =
            status === "ready_for_approval"
              ? "Present the report to the developer and ask for a decision, then call team_mate_decide."
              : status === "rework"
                ? "Findings were sent to the worker. You will be notified when it finishes."
                : "Recorded."
          return {
            content: `Review recorded. Task ${input.taskID} is now ${status}. ${next}`,
            metadata: { taskID: input.taskID, status },
          }
        }),
    })

    editor.add({
      name: "send_feedback",
      description: "Send additional guidance to a task's worker outside a formal review.",
      input: FeedbackArgs,
      execute: (input) =>
        orchestrator.sendFeedback(input).pipe(
          Effect.map(() => ({
            content: `Guidance sent to the worker for task ${input.taskID}.`,
            metadata: { taskID: input.taskID },
          })),
        ),
    })

    editor.add({
      name: "decide",
      description:
        "Record the developer's decision for a task: approve, request-changes, reject, or finalize.",
      input: DecideArgs,
      execute: (input) =>
        orchestrator.decide(input).pipe(
          Effect.map(() => ({
            content: `Decision "${input.decision}" recorded for task ${input.taskID}.`,
            metadata: { taskID: input.taskID, decision: input.decision },
          })),
        ),
    })

    editor.add({
      name: "cancel_task",
      description: "Interrupt a task's worker and mark the task cancelled.",
      input: CancelArgs,
      execute: (input) =>
        orchestrator.cancel(input).pipe(
          Effect.map(() => ({
            content: `Task ${input.taskID} cancelled.`,
            metadata: { taskID: input.taskID },
          })),
        ),
    })
  })
