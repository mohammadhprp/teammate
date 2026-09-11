# Orchestration

The orchestrator is the deterministic engine that advances tasks. It is a
single-writer loop fed by tool commands and OpenCode events. All task mutations
pass through it, which prevents concurrent writes and makes the state machine
easy to reason about.

## Shape

```text
tools ───────┐
             ├──> command Queue ──> orchestrator fiber ──> store + OpenCode API
events ──────┘
```

- **Commands** come from tool executors and from the event consumer.
- **The orchestrator** processes one command at a time and mutates the store.
- **The store** is the persisted source of truth. The `Ref` is the hot cache.

Start both fibers in the plugin scope in the entrypoint.

```ts title="src/orchestrator.ts"
export const startOrchestrator = (ctx: Context, store: Store, options: Options) =>
  Effect.gen(function* () {
    const commands = yield* Queue.unbounded<Command>()
    const tasks = yield* Ref.make(yield* store.loadTasks())
    const semaphore = yield* Semaphore.make(options.maxConcurrentTasks)

    const orchestrator = {
      delegate: (input: DelegateInput, originSessionID: string) =>
        enqueue(commands, { _tag: "Delegate", input, originSessionID }),
      submitReview: (input: SubmitReviewInput) =>
        enqueue(commands, { _tag: "SubmitReview", input }),
      sendFeedback: (input: SendFeedbackInput) =>
        enqueue(commands, { _tag: "SendFeedback", input }),
      decide: (input: DecideInput) => enqueue(commands, { _tag: "Decide", input }),
      cancel: (input: CancelTaskInput) =>
        enqueue(commands, { _tag: "Cancel", input }),
    }

    yield* processCommands(ctx, store, tasks, semaphore, options, commands).pipe(
      Effect.forkScoped,
    )

    return orchestrator
  })
```

Expose only typed methods on the orchestrator handle. Tool executors never
touch the store directly.

## Command queue

Each command is a discriminated union. Include a `Deferred` when the caller
must observe the result; omit it for fire-and-forget.

```ts title="src/orchestrator.ts"
type Command =
  | { readonly _tag: "Delegate"; readonly input: DelegateInput; readonly originSessionID: string }
  | { readonly _tag: "SubmitReview"; readonly input: SubmitReviewInput }
  | { readonly _tag: "SendFeedback"; readonly input: SendFeedbackInput }
  | { readonly _tag: "Decide"; readonly input: DecideInput }
  | { readonly _tag: "Cancel"; readonly input: CancelTaskInput }
  | { readonly _tag: "WorkerIdle"; readonly sessionID: string }
  | { readonly _tag: "WorkerFailed"; readonly sessionID: string; readonly error: string }
```

Process commands with `Stream.fromQueue` or a recursive `Effect.gen` loop. A
`Stream` gives backpressure handling for free.

```ts
const processCommands = (ctx: Context, store: Store, tasks: Ref.Ref<Map<string, Task>>, semaphore: Semaphore.Semaphore, options: Options, commands: Queue.Queue<Command>) =>
  Stream.fromQueue(commands).pipe(
    Stream.runForEach((command) =>
      handleCommand(ctx, store, tasks, semaphore, options, command).pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("team-mate command failed", { command, cause }),
        ),
      ),
    ),
  )
```

## Delegation

`Delegate` creates the worker session, records the task, and starts monitoring.

```ts title="src/orchestrator.ts"
const onDelegate = (ctx: Context, store: Store, tasks: Ref.Ref<Map<string, Task>>, semaphore: Semaphore.Semaphore, options: Options, input: DelegateInput, originSessionID: string) =>
  Effect.gen(function* () {
    const taskID = makeTaskID()
    const task: Task = {
      id: taskID,
      title: input.title,
      goal: input.goal,
      context: input.context,
      acceptanceCriteria: input.acceptanceCriteria,
      constraints: input.constraints,
      status: "delegated",
      originSessionID,
      directory: ctx.location.directory,
      worker: { sessionID: "", agent: options.workerAgent },
      iteration: 0,
      maxIterations: options.maxReviewIterations,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const worker = yield* ctx.session.create({
      title: `[Team Mate] ${input.title}`,
      agent: options.workerAgent,
    })
    task.worker.sessionID = worker.id
    task.status = "working"

    yield* store.putTask(task)
    yield* Ref.update(tasks, (map) => map.set(task.id, task))
    yield* store.appendTimeline(task.id, {
      at: Date.now(),
      taskID: task.id,
      kind: "task.created",
      summary: `Delegated to ${worker.id}`,
    })

    yield* ctx.session.prompt({
      sessionID: worker.id,
      text: buildWorkerBrief(task),
      delivery: "steer",
    })

    yield* monitorWorker(ctx, store, tasks, semaphore, task.id).pipe(Effect.forkScoped)
  })
```

Key points:

- Create the session first, then persist the real session ID. Do not store a
  placeholder as the source of truth.
- Fork monitoring into the scope so a plugin reload cancels it.
- The tool returns before the worker finishes.

## Monitoring

Monitoring uses `session.wait` as the completion signal and session state as
the outcome source. Events refine progress; they are not required for
correctness.

```ts title="src/orchestrator.ts"
const monitorWorker = (ctx: Context, store: Store, tasks: Ref.Ref<Map<string, Task>>, semaphore: Semaphore.Semaphore, taskID: string) =>
  Effect.gen(function* () {
    const task = yield* requireTask(tasks, taskID)

    yield* ctx.session.wait({ sessionID: task.worker.sessionID })
    const session = yield* ctx.session.get({ sessionID: task.worker.sessionID })
    const outcome = session.outcome ?? "succeeded"

    yield* store.appendTimeline(taskID, {
      at: Date.now(),
      taskID,
      kind: outcome === "succeeded" ? "worker.idle" : "worker.failed",
      summary: `Worker outcome: ${outcome}`,
    })

    if (outcome === "failed" || outcome === "interrupted") {
      yield* transition(store, tasks, taskID, {
        status: "failed",
        error: `Worker ${outcome}`,
        lastWorkerOutcome: outcome,
      })
      yield* notifyPrimaryFailure(ctx, store, taskID)
      return
    }

    yield* transition(store, tasks, taskID, {
      status: "awaiting_review",
      lastWorkerOutcome: outcome,
    })
    yield* requestReview(ctx, store, taskID)
  })
```

### Why `wait` and not events

The event stream is volatile. A slow consumer overflows and fails, and events
during a disconnection are missed. A review must not be skipped because an
event was dropped. `session.wait` is a durable wait on session state, so it is
the completion trigger. Use events to report progress, not to decide outcomes.

### Progress from events

Attach a separate consumer to the event stream and update a progress map keyed
by worker session ID. This powers `team_mate_get_task` while work runs.

```ts title="src/events.ts"
export const consumeEvents = (ctx: Context, progress: Ref.Ref<Map<string, Progress>>) =>
  ctx.event.subscribe().pipe(
    Stream.filter((event) =>
      event.type === "message.updated" ||
      event.type === "message.part.updated" ||
      event.type === "session.status" ||
      event.type === "session.error" ||
      event.type === "tool.execute.updated",
    ),
    Stream.runForEach((event) => updateProgress(progress, event)),
  )
```

Progress is advisory. If events stop, the task still completes because
`session.wait` owns the outcome.

### Reading the worker report

The Effect session domain does not expose a message-history method. Build the
worker report from events and the session record:

- Accumulate assistant `text` parts from `message.part.updated` events into a
  per-session buffer.
- On idle, take the last assistant text as the report.
- If no text was captured, record an empty report and let the primary agent
  inspect the session directly.

The worker brief requires a structured final report, which makes the captured
text reliable.

## Review request

When the worker is idle, ask the primary agent to review. Use a synthetic
message with `resume: true` so the primary runs a review turn. Deliver it as
`queue` so it waits for any active developer turn.

```ts title="src/orchestrator.ts"
const requestReview = (ctx: Context, store: Store, taskID: string) =>
  Effect.gen(function* () {
    const task = yield* store.getTask(taskID)
    const evidence = yield* collectEvidence(ctx, store, task)
    const review = yield* store.putReview(
      task.id,
      evidence.iteration,
      { status: "reviewing" },
    )

    yield* store.appendTimeline(taskID, {
      at: Date.now(),
      taskID: task.id,
      kind: "review.requested",
      summary: `Review requested for iteration ${evidence.iteration}`,
    })

    yield* ctx.session.synthetic({
      sessionID: task.originSessionID,
      text: buildReviewRequest(task, evidence),
      delivery: "queue",
      resume: true,
      description: "Team Mate review request",
    })
  })
```

The review request tells the primary agent exactly what to do:

```text
Team Mate review required.

Task: {title}
Iteration: {n} of {max}
Goal: {goal}
Acceptance criteria:
  1. {criterion}

Worker report:
{report}

Changed files:
{file list with additions/deletions}

Inspect the repository directly. Run the relevant checks. Then call
team_mate_submit_review with a verdict and findings. Do not approve the work
unless every acceptance criterion is satisfied and no blocker or major
findings remain.
```

The plugin also supplies the collected evidence through
`team_mate_get_task({ taskID, detail: "full" })` so the primary can pull fresh
data at review time.

## Evidence collection

Collect evidence at review time, not at delegation time.

```ts title="src/orchestrator.ts"
const collectEvidence = (ctx: Context, store: Store, task: Task) =>
  Effect.gen(function* () {
    const status = yield* ctx.vcs.status()
    const diff = yield* ctx.vcs.diff({ mode: "working", context: 3 })
    const report = yield* store.getLatestReport(task.id)

    return {
      iteration: task.iteration + 1,
      report,
      files: diff.data.map((entry) => ({
        file: entry.file,
        additions: entry.additions,
        deletions: entry.deletions,
      })),
      diffStat: {
        files: diff.data.length,
        additions: diff.data.reduce((sum, entry) => sum + entry.additions, 0),
        deletions: diff.data.reduce((sum, entry) => sum + entry.deletions, 0),
      },
      vcsStatus: status.data,
    }
  })
```

Diff scope matters. If workers share the checkout, the diff includes unrelated
changes. Prefer one worker at a time, or isolate workers per task. See
[Security and isolation](08-security-and-isolation.md).

## Review submission

`team_mate_submit_review` enqueues a `SubmitReview` command. The orchestrator
persists the review and chooses the next step.

```ts title="src/orchestrator.ts"
const onSubmitReview = (ctx: Context, store: Store, tasks: Ref.Ref<Map<string, Task>>, semaphore: Semaphore.Semaphore, input: SubmitReviewInput) =>
  Effect.gen(function* () {
    const task = yield* requireTask(tasks, input.taskID)
    if (input.verdict === "pass" && input.findings.some(isBlocking)) {
      return yield* Effect.fail(
        new Tool.Error({
          message: "A pass verdict cannot include open blocker or major findings.",
        }),
      )
    }

    const review = yield* store.putReview(task.id, task.iteration + 1, {
      verdict: input.verdict,
      summary: input.summary,
      findings: input.findings,
    })
    yield* store.appendTimeline(task.id, {
      at: Date.now(),
      taskID: task.id,
      kind: "review.submitted",
      summary: `${input.verdict}: ${input.summary}`,
    })

    const exhausted = task.iteration + 1 >= task.maxIterations
    if (input.verdict === "pass" || exhausted) {
      yield* transition(store, tasks, task.id, {
        status: "ready_for_approval",
        iteration: task.iteration + 1,
        lastReviewVerdict: input.verdict,
      })
      return
    }

    yield* transition(store, tasks, task.id, {
      status: "rework",
      iteration: task.iteration + 1,
      lastReviewVerdict: input.verdict,
    })
    yield* sendFeedbackToWorker(ctx, store, tasks, semaphore, task.id, review)
  })
```

When the limit is exhausted with open findings, the task still moves to
`ready_for_approval`. The approval report marks the remaining concerns so the
developer decides with full information.

## Feedback loop

Feedback is one worker prompt per iteration. Send only open findings. Include
enough context that the worker can act without re-reading the review.

```ts title="src/orchestrator.ts"
const sendFeedbackToWorker = (ctx: Context, store: Store, tasks: Ref.Ref<Map<string, Task>>, semaphore: Semaphore.Semaphore, taskID: string, review: Review) =>
  Effect.gen(function* () {
    const task = yield* requireTask(tasks, taskID)
    const open = review.findings.filter((finding) => finding.status === "open")

    yield* ctx.session.prompt({
      sessionID: task.worker.sessionID,
      text: buildFeedbackPrompt(task, review, open),
      delivery: "steer",
    })
    yield* store.appendTimeline(taskID, {
      at: Date.now(),
      taskID: task.id,
      kind: "feedback.sent",
      summary: `${open.length} findings sent for iteration ${review.iteration}`,
    })

    yield* transition(store, tasks, taskID, { status: "working" })
    yield* monitorWorker(ctx, store, tasks, semaphore, taskID).pipe(Effect.forkScoped)
  })
```

Feedback format:

```text
Review findings for Team Mate task {taskID}, iteration {n}.

Blockers:
  - [{file}:{line}] {title}: {detail}

Major:
  - {title}: {detail}

Address each finding. Do not expand scope. When finished, end with the same
structured report as before.
```

## Concurrency

Bound worker sessions with a `Semaphore`. Acquire before creating a worker and
release when the task reaches a terminal or approval state.

```ts
yield* semaphore.withPermits(1)(monitorWorker(ctx, store, tasks, semaphore, taskID))
```

Review is serialized per primary session. A single primary agent reviews one
task at a time. If two tasks finish together, request review for the first and
queue the second behind the primary's next idle cycle.

## Idempotency and recovery

The orchestrator must survive reloads and duplicate commands.

- **Stable IDs.** Use the task ID as the idempotency key for reviews and
  timeline entries.
- **State guards.** Before a transition, verify the source state. Ignore a
  `SubmitReview` for a task that is not `reviewing`.
- **Recovery on load.** Tasks in `working` or `reviewing` were interrupted.
  Mark them `paused` and notify the primary agent with a recovery summary:
  "Task X was interrupted by a plugin reload. Review the worker session and
  decide whether to continue, cancel, or restart."
- **Single writer.** Only the orchestrator fiber mutates tasks. Tool executors
  enqueue and await a result.
- **Bounded retries.** Do not silently retry a failed worker. A failed worker
  is a developer-visible event.

## Shutdown

When the scope closes, the orchestrator stops accepting commands. Add a
finalizer that marks active tasks `paused` and flushes the `Ref` to storage so
the next load can recover.

```ts
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    yield* flushTasks(store, tasks)
    yield* markActivePaused(store)
  }),
)
```
