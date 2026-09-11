import { Plugin } from "@opencode/plugin/effect"
import { Effect, Queue, Ref } from "effect"
import { ACTIVE_STATUSES, type Ctx, type Task } from "./domain"
import { makeOrchestrator, startOrchestrator, type Command, type Options } from "./orchestrator"
import { makeStore } from "./store"
import { registerTools } from "./tools"

const loadOptions = (ctx: Ctx): Options => ({
  workerAgent:
    typeof ctx.options.workerAgent === "string" ? ctx.options.workerAgent : "team-mate-worker",
  maxConcurrentTasks:
    typeof ctx.options.maxConcurrentTasks === "number" ? ctx.options.maxConcurrentTasks : 1,
  maxReviewIterations:
    typeof ctx.options.maxReviewIterations === "number" ? ctx.options.maxReviewIterations : 3,
})

export default Plugin.define({
  id: "team-mate",
  effect: (ctx) =>
    Effect.gen(function* () {
      const options = loadOptions(ctx)
      const store = makeStore(ctx)
      const tasks = yield* Ref.make(new Map<string, Task>())

      const persisted = yield* store.listTasks()
      yield* Effect.forEach(
        persisted,
        (task) =>
          Effect.gen(function* () {
            if (ACTIVE_STATUSES.has(task.status)) {
              task.status = "paused"
              yield* store.putTask(task)
            }
            yield* Ref.update(tasks, (map) => {
              const next = new Map(map)
              next.set(task.id, task)
              return next
            })
          }),
        { discard: true },
      )

      const queue = yield* Queue.unbounded<Command>()
      const orchestrator = makeOrchestrator(queue)
      yield* startOrchestrator(ctx, store, tasks, options, queue).pipe(Effect.forkScoped)
      yield* registerTools(ctx, store, tasks, orchestrator, options)

      yield* Effect.logInfo("team-mate loaded", {
        directory: ctx.location.directory,
        workerAgent: options.workerAgent,
        recovered: persisted.length,
      })
      yield* Effect.addFinalizer(() => Effect.logInfo("team-mate unloaded"))
    }),
})
