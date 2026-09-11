import { Effect } from "effect"
import type { Ctx, Decision, Review, Task } from "./domain"

const taskKey = (id: string) => `tm/task/${id}`
const decisionKey = (id: string) => `tm/decision/${id}`
const reviewKey = (taskID: string, iteration: number) => `tm/review/${taskID}/${iteration}`

export interface Store {
  putTask(task: Task): Effect.Effect<void>
  getTask(id: string): Effect.Effect<Task | undefined>
  listTasks(): Effect.Effect<Task[]>
  putReview(review: Review): Effect.Effect<void>
  listReviews(taskID: string): Effect.Effect<Review[]>
  putDecision(decision: Decision): Effect.Effect<void>
  getDecision(taskID: string): Effect.Effect<Decision | undefined>
}

const parse = <A>(value: unknown): A | undefined => {
  if (value === undefined || value === null) return undefined
  return value as A
}

export const makeStore = (ctx: Ctx): Store => {
  const { storage } = ctx
  return {
    putTask: (task) => storage.set(taskKey(task.id), task as unknown as never),
    getTask: (id) =>
      storage.get(taskKey(id)).pipe(Effect.map((value) => (value ? parse<Task>(value) : undefined))),
    listTasks: () =>
      storage.scan({ prefix: "tm/task/", limit: 500 }).pipe(
        Effect.map((page) =>
          page.entries
            .map((entry) => parse<Task>(entry.value))
            .filter((task): task is Task => task !== undefined)
            .sort((a, b) => a.createdAt - b.createdAt),
        ),
      ),
    putReview: (review) => storage.set(reviewKey(review.taskID, review.iteration), review as unknown as never),
    listReviews: (taskID) =>
      storage.scan({ prefix: `tm/review/${taskID}/`, limit: 500 }).pipe(
        Effect.map((page) =>
          page.entries
            .map((entry) => parse<Review>(entry.value))
            .filter((review): review is Review => review !== undefined)
            .sort((a, b) => a.iteration - b.iteration),
        ),
      ),
    putDecision: (decision) => storage.set(decisionKey(decision.taskID), decision as unknown as never),
    getDecision: (taskID) =>
      storage.get(decisionKey(taskID)).pipe(Effect.map((value) => (value ? parse<Decision>(value) : undefined))),
  }
}
