# API mapping

This appendix maps each Team Mate operation to the OpenCode v2 Effect plugin
API, with the corresponding HTTP route. Use it as the implementation checklist
and as a record of where the Effect surface is narrower than the HTTP API.

## Plugin surface

| Team Mate need | Effect plugin API | HTTP route |
| --- | --- | --- |
| Define plugin | `Plugin.define({ id, effect })` | - |
| Read location | `ctx.app`, `ctx.options` | `GET /api/location` |
| Register tools | `ctx.tool.transform(editor => ...)` | - |
| Register commands | `ctx.command.transform(editor => ...)` | `GET /api/command` |
| Register skills | `ctx.skill.transform(editor => ...)` | `GET /api/skill` |
| Durability | `ctx.storage` | - |
| Read agents | `ctx.agent.list()`, `ctx.agent.get()` | `GET /api/agent` |
| Adjust agents | `ctx.agent.transform()`, `ctx.agent.reload()` | - |
| Subscribe events | `ctx.event.subscribe()` | `GET /api/event` |
| Read VCS | `ctx.vcs.get()`, `status()`, `diff()` | `GET /api/vcs*` |
| Shell hook | `ctx.shell.hook("create.before")` | `GET /api/shell` |
| RPC | `ctx.rpc` (not used in v1) | `POST /api/rpc/{rpcID}/{method}` |

## Sessions

The Effect `SessionDomain` includes `create`, `get`, `switchAgent`,
`switchModel`, `prompt`, `generate`, `command`, `synthetic`, `interrupt`,
`rename`, and `wait`.

| Team Mate operation | Effect call | HTTP route |
| --- | --- | --- |
| Create worker | `ctx.session.create({ title, agent, model?, location? })` | `POST /api/session` |
| Read session | `ctx.session.get({ sessionID })` | `GET /api/session/{sessionID}` |
| Send brief | `ctx.session.prompt({ sessionID, text, delivery })` | `POST /api/session/{sessionID}/prompt` |
| Wait for idle | `ctx.session.wait({ sessionID })` | `POST /api/session/{sessionID}/wait` |
| Request review | `ctx.session.synthetic({ sessionID, text, resume, delivery })` | `POST /api/session/{sessionID}/synthetic` |
| Run command | `ctx.session.command({ sessionID, command, arguments })` | `POST /api/session/{sessionID}/command` |
| Generate text | `ctx.session.generate({ sessionID, prompt })` | `POST /api/session/{sessionID}/generate` |
| Interrupt worker | `ctx.session.interrupt({ sessionID })` | `POST /api/session/{sessionID}/interrupt` |
| Rename task session | `ctx.session.rename({ sessionID, title })` | `POST /api/session/{sessionID}/rename` |
| Switch worker agent | `ctx.session.switchAgent({ sessionID, agent })` | `POST /api/session/{sessionID}/agent` |
| Switch worker model | `ctx.session.switchModel({ sessionID, model })` | `POST /api/session/{sessionID}/model` |

### Create input

```ts
interface SessionCreateInput {
  readonly id?: string
  readonly title?: string | null
  readonly agent?: string | null
  readonly model?: ModelRef | null
  readonly location?: LocationRef | null
  readonly metadata?: SessionMetadata | null
}

interface ModelRef {
  readonly id: string
  readonly providerID: string
  readonly variant?: string
}

interface LocationRef {
  readonly directory: string
  readonly workspaceID?: string
}
```

`create` returns `Session.Info` directly in the Effect client.

### Prompt input

```ts
interface SessionPromptInput {
  readonly id?: string | null
  readonly text: string
  readonly files?: ReadonlyArray<PromptFileAttachment>
  readonly agents?: ReadonlyArray<PromptAgentAttachment>
  readonly skills?: ReadonlyArray<PromptSkillAttachment>
  readonly metadata?: Record<string, unknown>
  readonly delivery?: "steer" | "queue" | null
  readonly resume?: boolean | null
}
```

- `delivery: "steer"` admits immediately.
- `delivery: "queue"` waits for the current turn to finish.
- `resume: true` schedules agent-loop execution unless it is `false`.

### Synthetic input

```ts
interface SessionSyntheticInput {
  readonly id?: string | null
  readonly text: string
  readonly description?: string | null
  readonly metadata?: Record<string, unknown>
  readonly delivery?: "steer" | "queue" | null
  readonly resume?: boolean | null
}
```

Use synthetic with `resume: true` to wake the primary agent for review without
pretending to be the developer.

### Session info

```ts
interface SessionInfo {
  readonly id: string
  readonly parentID?: string
  readonly projectID: string
  readonly agent?: string
  readonly model?: ModelRef
  readonly cost: number
  readonly tokens: TokenUsage
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  readonly time: {
    readonly created: number
    readonly updated: number
    readonly idle?: number
    readonly viewed?: number
    readonly archived?: number
  }
  readonly title?: string
  readonly location: LocationRef
  readonly metadata?: Record<string, unknown>
}
```

`outcome` is the worker completion signal after `wait` returns.

## Tools

```ts
interface ToolEditor {
  list(): readonly (ToolInfo & { readonly id: string })[]
  get(id: string): (ToolInfo & { readonly id: string }) | undefined
  namespace(namespace: { name: string; description: string }): void
  add<Input, Output>(tool: ToolInfo<Input, Output>): void
  update(id: string, update: (tool: Mutable<ToolInfo>) => void): void
  remove(id: string): void
}
```

A tool definition:

```ts
{
  name: string
  description: string
  input: Schema
  output?: Schema
  options?: { namespace?: string; codemode?: boolean }
  execute: (input, context) => Effect.Effect<{
    output?: unknown
    content?: ReadonlyArray<Tool.Content>
    metadata?: unknown
  }>
}
```

The effective name is `team_mate_<name>`. Updates and removals use that
effective name.

## Events

```ts
interface EventDomain {
  subscribe(): Stream.Stream<OpenCodeEvent>
}
```

The HTTP stream is SSE: each frame has `id`, `event`, and `data` where `data`
is a JSON string. The Effect stream decodes frames into events with a `type`
field. Filter and consume with Stream operators.

```ts
yield* ctx.event.subscribe().pipe(
  Stream.filter((event) => event.type === "session.status"),
  Stream.runForEach((event) => Effect.logDebug("event", event)),
  Effect.forkScoped,
)
```

Events are volatile. See [Monitoring](05-orchestration.md) for why completion
uses `session.wait` instead of events.

## VCS

| Team Mate use | Effect call | HTTP route |
| --- | --- | --- |
| Repo info | `ctx.vcs.get()` | `GET /api/vcs` |
| Working status | `ctx.vcs.status()` | `GET /api/vcs/status` |
| Branches | `ctx.vcs.branches({ search, limit })` | `GET /api/vcs/branches` |
| Diff | `ctx.vcs.diff({ mode, context })` | `GET /api/vcs/diff` |

```ts
interface FileDiffInfo {
  readonly file: string
  readonly patch: string
  readonly additions: number
  readonly deletions: number
  readonly status: "added" | "deleted" | "modified"
}
```

Collect a diff stat for the review evidence. Do not store the full patch.

## Storage

```ts
interface StorageDomain {
  get(key: string): Effect.Effect<Json | undefined>
  set(key: string, value: Json): Effect.Effect<void>
  remove(key: string): Effect.Effect<void>
  scan(options: {
    prefix: string
    after?: string
    limit?: number
  }): Effect.Effect<{
    entries: readonly { key: string; value: Json }[]
    next?: string
  }>
}
```

Use `scan` with the `task/` prefix for recovery and task boards.

## Agents

```ts
interface AgentDomain {
  list(): Effect.Effect<{ data: readonly AgentInfo[] }>
  get(input: { agentID: string }): Effect.Effect<{ data: AgentInfo }>
  transform(callback: (editor: AgentEditor) => void): Effect.Effect<Registration, never, Scope.Scope>
  reload(): Effect.Effect<void>
}

interface AgentEditor {
  list(): readonly AgentInfo[]
  get(id: string): AgentInfo | undefined
  default(id: string | undefined): void
  update(id: string, update: (agent: AgentInfo) => void): void
  remove(id: string): void
}
```

There is no `add`. Define agents in configuration.

## Commands

```ts
interface CommandDomain {
  list(): Effect.Effect<{ data: readonly CommandInfo[] }>
  transform(callback: (editor: CommandEditor) => void): Effect.Effect<Registration, never, Scope.Scope>
  reload(): Effect.Effect<void>
}

interface CommandEditor {
  add(definition: {
    name: string
    description?: string
    execute: (input: {
      sessionID: string
      prompt: PromptInput
      delivery: "steer" | "queue"
    }) => Effect.Effect<void, unknown>
  }): void
}
```

## Session hooks

The Effect plugin exposes these session hooks:

| Hook | Use in Team Mate |
| --- | --- |
| `context` | Optional: inject review standards into the primary agent's system prompt. |
| `compaction` | Optional: summarize the worker transcript. |
| `generate` | Optional: shape transient generation. |
| `title` | Not used. |
| `model.request` | Optional: provider headers. |
| `http.request` | Optional: request tagging. |
| `http.response` | Optional: response inspection. |
| `retry` | Optional: retry policy for provider failures. |

The Effect surface does not include the `prompt` hook from the Promise API.
Team Mate does not depend on it.

## Surface gaps

| Gap | Impact | Mitigation |
| --- | --- | --- |
| No `permission` domain or hook | Cannot evaluate policy dynamically. | Static agent permissions, or a companion Promise plugin. |
| No `worktree` domain | Cannot create worktrees in-process. | Shell command, HTTP client, or a companion plugin. |
| No message-history method on `SessionDomain` | Cannot read worker messages directly. | Capture assistant text from events; fall back to the client. |
| No session `list` in `SessionDomain` | Cannot enumerate sessions. | Track task sessions in storage. |
| Agents have no `add` | Cannot register agents from the plugin. | Define agents in configuration. |
| Events are volatile | Missed events during disconnection. | Completion via `session.wait`; events are advisory. |

## Verification checklist

Before implementation, confirm against the installed `@opencode/plugin` and
`@opencode/client` packages:

1. The tool execution context field for the calling session.
2. The decoded event type and session-identifying field.
3. The exact event names for session and message updates.
4. `session.wait` behavior and `Session.Info.outcome` values.
5. The `session.command` argument field name.
6. The v2 config key for agents.
7. The module paths for `Plugin`, `Skill`, and tool content types.
8. The Effect version required by the target OpenCode release.
