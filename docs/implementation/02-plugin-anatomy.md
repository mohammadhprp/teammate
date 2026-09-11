# Plugin anatomy

Team Mate is an Effect plugin. This document maps the design onto the Effect
plugin lifecycle, package layout, context domains, and configuration.

## Package layout

```text
teammate/
├── package.json
├── opencode.jsonc                 # host configuration (agents, plugin entry)
└── src/
    ├── index.ts                   # Plugin.define entrypoint
    ├── config.ts                  # option parsing and defaults
    ├── domain/
    │   ├── task.ts                # Task, Finding, Review schemas
    │   └── timeline.ts            # audit entry schemas
    ├── store.ts                   # storage-backed state and recovery
    ├── orchestrator.ts            # single-writer command loop
    ├── events.ts                  # OpenCode event subscription
    ├── session.ts                 # worker session helpers
    ├── tools/
    │   ├── index.ts               # registers the tool namespace
    │   ├── delegate.ts
    │   ├── status.ts
    │   ├── review.ts
    │   ├── feedback.ts
    │   └── approval.ts
    └── prompts.ts                 # worker brief and review request builders
```

The package exports a single default implementation.

```json title="package.json"
{
  "name": "teammate",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@opencode/plugin": "latest",
    "effect": "4.0.0-rc.111"
  }
}
```

## Entrypoint

The `effect` function runs when the plugin loads. Its scope closes when the
plugin reloads or unloads, so every registration, fiber, and finalizer is
released together.

```ts title="src/index.ts"
import { Plugin } from "@opencode/plugin/effect"
import { Effect } from "effect"
import { registerTools } from "./tools"
import { startOrchestrator } from "./orchestrator"

export default Plugin.define({
  id: "team-mate",
  effect: (ctx) =>
    Effect.gen(function* () {
      const options = yield* loadOptions(ctx)
      const store = yield* makeStore(ctx)
      yield* recoverTasks(store)

      const orchestrator = yield* startOrchestrator(ctx, store, options)
      yield* registerTools(ctx, store, orchestrator, options)

      yield* Effect.logInfo("team-mate loaded", {
        version: ctx.app.version,
        maxConcurrentTasks: options.maxConcurrentTasks,
      })
    }),
})
```

The entrypoint does three things:

1. Loads options and durable state.
2. Starts the orchestrator and event consumer.
3. Registers tools, commands, and skills.

Keep the effect focused on wiring. Put behavior in modules so it stays testable.

## Context domains used

The Effect plugin context exposes the OpenCode client plus plugin-only
transforms, hooks, storage, and options.

| Domain | Team Mate use |
| --- | --- |
| `ctx.app` | Version and environment logging. |
| `ctx.options` | Plugin options from `opencode.jsonc`. |
| `ctx.tool` | Register the `team_mate_*` tools. |
| `ctx.command` | Register `/team` and related commands. |
| `ctx.session` | Create, prompt, wait, interrupt, and synthesize for sessions. |
| `ctx.event` | Subscribe to OpenCode events for live progress. |
| `ctx.vcs` | Read working-copy status and diffs for review evidence. |
| `ctx.storage` | Persist tasks, reviews, decisions, and timeline entries. |
| `ctx.agent` | Read and adjust the configured agents. |
| `ctx.skill` | Optionally register a delegation skill. |
| `ctx.shell` | Optionally constrain shell execution for workers. |

Team Mate does not use `catalog`, `integration`, `mcp`, `plugin`, `reference`,
`rpc`, or `websearch` in v1.

## Storage

`ctx.storage` stores durable JSON scoped to the plugin ID. Team Mate uses a
prefix-per-record layout so it can scan without a global index.

```ts
interface StorageDomain {
  get(key: string): Effect.Effect<Schema.Json | undefined>
  set(key: string, value: Schema.Json): Effect.Effect<void>
  remove(key: string): Effect.Effect<void>
  scan(options: StorageScanOptions): Effect.Effect<StorageScanResult>
}
```

Write helpers validate before persisting. Read helpers decode and skip corrupt
records rather than failing the orchestrator.

```ts title="src/store.ts"
const TASK_PREFIX = "task/"

export const putTask = (storage: StorageDomain, task: Task) =>
  storage.set(`${TASK_PREFIX}${task.id}`, Task.encode(task))

export const scanTasks = (storage: StorageDomain) =>
  storage.scan({ prefix: TASK_PREFIX, limit: 200 }).pipe(
    Effect.map((page) => page.entries.flatMap(decodeTask)),
  )
```

Store schemas with their encoded form to keep records stable across plugin
updates. See [Domain model](03-domain-model.md) for the full layout.

## Options

Read options from `ctx.options` and narrow unknown values before use. Keep the
defaults in one place.

```jsonc title="opencode.jsonc"
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./",
      "options": {
        "workerAgent": "team-mate-worker",
        "maxConcurrentTasks": 1,
        "maxReviewIterations": 3,
        "reviewDelivery": "queue"
      }
    }
  ]
}
```

```ts title="src/config.ts"
export interface Options {
  readonly workerAgent: string
  readonly maxConcurrentTasks: number
  readonly maxReviewIterations: number
  readonly reviewDelivery: "steer" | "queue"
}

export const loadOptions = (ctx: Context) =>
  Effect.succeed<Options>({
    workerAgent:
      typeof ctx.options.workerAgent === "string"
        ? ctx.options.workerAgent
        : "team-mate-worker",
    maxConcurrentTasks:
      typeof ctx.options.maxConcurrentTasks === "number"
        ? ctx.options.maxConcurrentTasks
        : 1,
    maxReviewIterations:
      typeof ctx.options.maxReviewIterations === "number"
        ? ctx.options.maxReviewIterations
        : 3,
    reviewDelivery: "queue",
  })
```

Option rules:

- **`workerAgent`** must name an agent configured with `mode: subagent`.
- **`maxConcurrentTasks`** bounds worker sessions. Start with `1`.
- **`maxReviewIterations`** bounds the review loop before escalation.
- **`reviewDelivery`** defaults to `queue` so review requests never interrupt a
  developer turn.

## Lifecycle patterns

### Scoped registrations

Transforms and hooks return registrations that live in the plugin scope.
Yielding the transform keeps the registration active for the plugin lifetime.

```ts
yield* ctx.tool.transform((editor) => {
  editor.namespace({ name: "team_mate", description: "Team Mate coordination" })
  editor.add(delegateTool)
})
```

### Scoped background fibers

Long-running work runs in a fiber forked into the plugin scope. When the scope
closes, the fiber is interrupted.

```ts
yield* consumeCommands(ctx, store).pipe(Effect.forkScoped)
yield* consumeEvents(ctx, store).pipe(Effect.forkScoped)
```

### Finalizers

Use finalizers for state that must be consistent across reloads, such as
marking active tasks as paused.

```ts
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    yield* markActiveTasksPaused(store)
    yield* Effect.logInfo("team-mate unloaded")
  }),
)
```

## Reloads

An Effect plugin does not expose a transform `reload` for tasks; `reload`
applies to catalog, agent, and similar registry domains. Team Mate re-reads its
own storage when it needs fresh state. The orchestrator holds the in-memory
`Ref`, so treat storage as the recovery source, not the hot path.

## Compatibility notes

- The Effect context does not expose a `permission` domain or a `worktree`
  domain. See [Security and isolation](08-security-and-isolation.md) and
  [API mapping](10-api-mapping.md).
- The Effect session domain exposes `create`, `get`, `switchAgent`,
  `switchModel`, `prompt`, `generate`, `command`, `synthetic`, `interrupt`,
  `rename`, and `wait`. It does not expose a message-history method. Monitoring
  uses events and session state instead.
- The Effect plugin API does not include the `prompt` session hook available in
  the Promise API. Team Mate does not depend on prompt admission hooks.
