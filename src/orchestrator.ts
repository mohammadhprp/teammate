import { Agent } from "@opencode/plugin/effect"
import { Tool } from "@opencode/schema/tool"
import { Cause, Deferred, Effect, Queue, Ref } from "effect"
import {
  ACTIVE_STATUSES,
  isBlocking,
  newId,
  type Ctx,
  type Decision,
  type Finding,
  type Review,
  type SessionID,
  type Task,
  type TaskStatus,
} from "./domain"
import { formatReport, buildApprovalRequest, buildFeedback, buildReviewRequest, buildWorkerBrief } from "./prompts"
import type { Store } from "./store"

export interface Options {
  workerAgent: string
  maxConcurrentTasks: number
  maxReviewIterations: number
}

export interface DelegateInput {
  title: string
  goal: string
  context?: string
  acceptanceCriteria: readonly string[]
  constraints?: readonly string[]
}

export interface DelegateResult {
  taskID: string
  workerSessionID: string
  status: TaskStatus
}

export interface ReviewInput {
  taskID: string
  verdict: "pass" | "fail" | "inconclusive"
  summary: string
  findings: readonly Finding[]
}

export interface FeedbackInput {
  taskID: string
  guidance: string
}

export interface DecideInput {
  taskID: string
  decision: "approve" | "request-changes" | "reject" | "finalize"
  note?: string
}

export interface CancelInput {
  taskID: string
}

export interface Orchestrator {
  delegate(input: DelegateInput, originSessionID: string): Effect.Effect<DelegateResult, Tool.Error>
  submitReview(input: ReviewInput): Effect.Effect<void, Tool.Error>
  sendFeedback(input: FeedbackInput): Effect.Effect<void, Tool.Error>
  decide(input: DecideInput): Effect.Effect<void, Tool.Error>
  cancel(input: CancelInput): Effect.Effect<void, Tool.Error>
}

type Reply<A> = Deferred.Deferred<A, Tool.Error>

export type Command =
  | { _tag: "Delegate"; input: DelegateInput; originSessionID: string; reply: Reply<DelegateResult> }
  | { _tag: "SubmitReview"; input: ReviewInput; reply: Reply<void> }
  | { _tag: "SendFeedback"; input: FeedbackInput; reply: Reply<void> }
  | { _tag: "Decide"; input: DecideInput; reply: Reply<void> }
  | { _tag: "Cancel"; input: CancelInput; reply: Reply<void> }

export const makeOrchestrator = (queue: Queue.Queue<Command>): Orchestrator => {
  const call = <A>(make: (reply: Reply<A>) => Command): Effect.Effect<A, Tool.Error> =>
    Effect.gen(function* () {
      const reply = yield* Deferred.make<A, Tool.Error>()
      yield* Queue.offer(queue, make(reply))
      return yield* Deferred.await(reply)
    })
  return {
    delegate: (input, originSessionID) =>
      call((reply) => ({ _tag: "Delegate", input, originSessionID, reply })),
    submitReview: (input) => call((reply) => ({ _tag: "SubmitReview", input, reply })),
    sendFeedback: (input) => call((reply) => ({ _tag: "SendFeedback", input, reply })),
    decide: (input) => call((reply) => ({ _tag: "Decide", input, reply })),
    cancel: (input) => call((reply) => ({ _tag: "Cancel", input, reply })),
  }
}

const getTask = (tasks: Ref.Ref<Map<string, Task>>, id: string) =>
  Ref.get(tasks).pipe(Effect.map((map) => map.get(id)))

const save = (store: Store, tasks: Ref.Ref<Map<string, Task>>, task: Task) =>
  Effect.gen(function* () {
    task.updatedAt = Date.now()
    yield* store.putTask(task)
    yield* Ref.update(tasks, (map) => {
      const next = new Map(map)
      next.set(task.id, task)
      return next
    })
  })

const notify = (ctx: Ctx, originSessionID: string, text: string) =>
  ctx.session
    .synthetic({ sessionID: originSessionID as SessionID, text, delivery: "queue" })
    .pipe(Effect.orDie)

export const captureReport = (ctx: Ctx, sessionID: SessionID): Effect.Effect<string> =>
  ctx.session.context({ sessionID }).pipe(
    Effect.orDie,
    Effect.map((messages) => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (!message || message.type !== "assistant") continue
        const text = message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n")
          .trim()
        if (text) return text
      }
      return ""
    }),
  )

export const diffSummary = (ctx: Ctx): Effect.Effect<string> =>
  ctx.vcs.diff({ mode: "working", context: 3 }).pipe(
    Effect.orDie,
    Effect.map((result) => {
      if (!result.data.length) return "No working-copy changes detected."
      return result.data
        .map((entry) => `  ${entry.status} ${entry.file} (+${entry.additions} -${entry.deletions})`)
        .join("\n")
    }),
  )

const monitor = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  taskID: string,
  workerSessionID: SessionID,
) =>
  Effect.gen(function* () {
    yield* ctx.session.wait({ sessionID: workerSessionID }).pipe(Effect.orDie)
    const info = yield* ctx.session.get({ sessionID: workerSessionID }).pipe(Effect.orDie)
    const task = yield* getTask(tasks, taskID)
    if (!task) return

    task.report = yield* captureReport(ctx, workerSessionID)

    if (info.outcome === "failed" || info.outcome === "interrupted") {
      task.status = "failed"
      task.error = `Worker ${info.outcome}`
      yield* save(store, tasks, task)
      yield* notify(
        ctx,
        task.originSessionID,
        `Team Mate task ${taskID} failed: worker ${info.outcome}. Use team_mate_get_task for details.`,
      )
      return
    }

    task.status = "awaiting_review"
    yield* save(store, tasks, task)
    yield* ctx.session
      .synthetic({
        sessionID: task.originSessionID as SessionID,
        text: buildReviewRequest(task, task.report),
        delivery: "queue",
        resume: true,
      })
      .pipe(Effect.orDie)
  })

const onDelegate = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  options: Options,
  input: DelegateInput,
  originSessionID: string,
) =>
  Effect.gen(function* () {
    const active = [...(yield* Ref.get(tasks)).values()].filter((task) =>
      ACTIVE_STATUSES.has(task.status),
    ).length
    if (active >= options.maxConcurrentTasks) {
      return yield* Effect.fail(
        new Tool.Error({
          message: `Concurrency limit reached (${options.maxConcurrentTasks}). Finish or cancel a task first.`,
        }),
      )
    }

    const worker = yield* ctx.session
      .create({ title: `[Team Mate] ${input.title}`, agent: options.workerAgent as Agent.ID })
      .pipe(Effect.orDie)

    const now = Date.now()
    const task: Task = {
      id: newId(),
      title: input.title,
      goal: input.goal,
      context: input.context,
      acceptanceCriteria: input.acceptanceCriteria,
      constraints: input.constraints,
      status: "working",
      originSessionID,
      directory: ctx.location.directory,
      workerSessionID: worker.id,
      workerAgent: options.workerAgent,
      iteration: 0,
      maxIterations: options.maxReviewIterations,
      createdAt: now,
      updatedAt: now,
    }

    yield* save(store, tasks, task)
    yield* ctx.session
      .prompt({ sessionID: worker.id, text: buildWorkerBrief(task), delivery: "steer" })
      .pipe(Effect.orDie)
    yield* monitor(ctx, store, tasks, task.id, worker.id).pipe(Effect.forkScoped)

    return { taskID: task.id, workerSessionID: worker.id, status: task.status }
  })

const onReview = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  input: ReviewInput,
) =>
  Effect.gen(function* () {
    const task = yield* getTask(tasks, input.taskID)
    if (!task) {
      return yield* Effect.fail(new Tool.Error({ message: `Unknown task ${input.taskID}.` }))
    }
    if (input.verdict === "pass" && input.findings.some(isBlocking)) {
      return yield* Effect.fail(
        new Tool.Error({
          message: "A pass verdict cannot include open blocker or major findings.",
        }),
      )
    }

    task.iteration += 1
    task.lastVerdict = input.verdict
    const review: Review = {
      taskID: task.id,
      iteration: task.iteration,
      verdict: input.verdict,
      summary: input.summary,
      findings: input.findings,
      at: Date.now(),
    }
    yield* store.putReview(review)

    const exhausted = task.iteration >= task.maxIterations
    if (input.verdict === "pass" || exhausted) {
      task.status = "ready_for_approval"
      yield* save(store, tasks, task)
      const reviews = yield* store.listReviews(task.id)
      yield* ctx.session
        .synthetic({
          sessionID: task.originSessionID as SessionID,
          text: `${buildApprovalRequest(task, review)}\n\n${formatReport(task, reviews)}`,
          delivery: "queue",
          resume: true,
        })
        .pipe(Effect.orDie)
      return
    }

    task.status = "rework"
    yield* save(store, tasks, task)
    yield* ctx.session
      .prompt({
        sessionID: task.workerSessionID as SessionID,
        text: buildFeedback(task, review),
        delivery: "steer",
      })
      .pipe(Effect.orDie)
    yield* monitor(ctx, store, tasks, task.id, task.workerSessionID as SessionID).pipe(
      Effect.forkScoped,
    )
  })

const onFeedback = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  input: FeedbackInput,
) =>
  Effect.gen(function* () {
    const task = yield* getTask(tasks, input.taskID)
    if (!task) {
      return yield* Effect.fail(new Tool.Error({ message: `Unknown task ${input.taskID}.` }))
    }
    task.status = "working"
    yield* save(store, tasks, task)
    yield* ctx.session
      .prompt({
        sessionID: task.workerSessionID as SessionID,
        text: `Additional guidance for Team Mate task ${task.id}:\n\n${input.guidance}\n\nContinue the task and end with the structured report.`,
        delivery: "steer",
      })
      .pipe(Effect.orDie)
    yield* monitor(ctx, store, tasks, task.id, task.workerSessionID as SessionID).pipe(
      Effect.forkScoped,
    )
  })

const onDecide = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  input: DecideInput,
) =>
  Effect.gen(function* () {
    const task = yield* getTask(tasks, input.taskID)
    if (!task) {
      return yield* Effect.fail(new Tool.Error({ message: `Unknown task ${input.taskID}.` }))
    }

    const decision: Decision = { taskID: task.id, kind: input.decision, note: input.note, at: Date.now() }
    yield* store.putDecision(decision)

    if (input.decision === "reject") {
      task.status = "rejected"
      yield* save(store, tasks, task)
      yield* ctx.session
        .interrupt({ sessionID: task.workerSessionID as SessionID })
        .pipe(Effect.orDie)
      return
    }

    if (input.decision === "request-changes") {
      task.status = "rework"
      yield* save(store, tasks, task)
      yield* ctx.session
        .prompt({
          sessionID: task.workerSessionID as SessionID,
          text: `The developer requested changes for Team Mate task ${task.id}:\n\n${input.note ?? "See the review findings."}\n\nContinue the task and end with the structured report.`,
          delivery: "steer",
        })
        .pipe(Effect.orDie)
      yield* monitor(ctx, store, tasks, task.id, task.workerSessionID as SessionID).pipe(
        Effect.forkScoped,
      )
      return
    }

    task.status = "approved"
    yield* save(store, tasks, task)
  })

const onCancel = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  input: CancelInput,
) =>
  Effect.gen(function* () {
    const task = yield* getTask(tasks, input.taskID)
    if (!task) {
      return yield* Effect.fail(new Tool.Error({ message: `Unknown task ${input.taskID}.` }))
    }
    task.status = "cancelled"
    yield* save(store, tasks, task)
    yield* ctx.session
      .interrupt({ sessionID: task.workerSessionID as SessionID })
      .pipe(Effect.orDie)
  })

const handle = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  options: Options,
  command: Command,
) => {
  switch (command._tag) {
    case "Delegate":
      return onDelegate(ctx, store, tasks, options, command.input, command.originSessionID).pipe(
        Effect.flatMap((result) => Deferred.succeed(command.reply, result)),
        Effect.asVoid,
      )
    case "SubmitReview":
      return onReview(ctx, store, tasks, command.input).pipe(
        Effect.flatMap(() => Deferred.succeed(command.reply, undefined)),
        Effect.asVoid,
      )
    case "SendFeedback":
      return onFeedback(ctx, store, tasks, command.input).pipe(
        Effect.flatMap(() => Deferred.succeed(command.reply, undefined)),
        Effect.asVoid,
      )
    case "Decide":
      return onDecide(ctx, store, tasks, command.input).pipe(
        Effect.flatMap(() => Deferred.succeed(command.reply, undefined)),
        Effect.asVoid,
      )
    case "Cancel":
      return onCancel(ctx, store, tasks, command.input).pipe(
        Effect.flatMap(() => Deferred.succeed(command.reply, undefined)),
        Effect.asVoid,
      )
  }
}

const failReply = (command: Command, cause: Cause.Cause<unknown>) =>
  Deferred.fail(command.reply as Reply<unknown>, new Tool.Error({ message: Cause.pretty(cause) }))

export const startOrchestrator = (
  ctx: Ctx,
  store: Store,
  tasks: Ref.Ref<Map<string, Task>>,
  options: Options,
  queue: Queue.Queue<Command>,
) =>
  Effect.forever(
    Effect.gen(function* () {
      const command = yield* Queue.take(queue)
      yield* handle(ctx, store, tasks, options, command).pipe(
        Effect.catchCause((cause) => failReply(command, cause)),
      )
    }),
  )
