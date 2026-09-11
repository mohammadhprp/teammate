# Agents and commands

Team Mate defines two agents and a small set of commands. The plugin registers
tools; configuration defines the agents that use them.

## Configuration

OpenCode reads agent definitions from `opencode.jsonc`. In the v2 config schema
the key is `agents`, and the default agent is `default_agent`.

```jsonc title="opencode.jsonc"
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "team-mate",
  "agents": {
    "team-mate": {
      "mode": "primary",
      "description": "Coordinates delegated work and reviews results",
      "system": "{file:./prompts/team-mate.md}",
      "permissions": [
        { "action": "edit", "resource": "**", "effect": "ask" }
      ]
    },
    "team-mate-worker": {
      "mode": "subagent",
      "description": "Executes one delegated Team Mate task",
      "system": "{file:./prompts/team-mate-worker.md}",
      "permissions": [
        { "action": "task", "resource": "*", "effect": "deny" },
        { "action": "team_mate_*", "resource": "*", "effect": "deny" }
      ]
    }
  },
  "plugins": [
    {
      "package": "./",
      "options": {
        "workerAgent": "team-mate-worker",
        "maxConcurrentTasks": 1,
        "maxReviewIterations": 3
      }
    }
  ]
}
```

Notes:

- Use `{file:...}` to keep long system prompts out of JSON. If your release
  does not resolve file references, inline the prompt value instead.
- Deny every `team_mate_*` action for the worker. Workers must not delegate,
  review, approve, or read task state.
- Deny `task` for the worker to prevent recursive subagents.
- Set `default_agent` to `team-mate` so new sessions start in coordinator mode.
  The developer can switch agents at any time.
- The v1 config used `agent`; the v2 schema uses `agents`. Confirm the key
  against the installed release.

## Primary agent

The primary agent is the developer's single point of interaction. It decides
when to delegate and judges whether work is correct.

### Responsibilities

1. Understand the request and turn it into a task with acceptance criteria.
2. Delegate with `team_mate_delegate_task`.
3. Inspect the repository when asked for status.
4. Review worker results independently.
5. Send findings back through `team_mate_submit_review`.
6. Present a report and request approval.
7. Record the developer's decision.
8. Never claim work is correct without reviewing it.

### System prompt

```markdown title="prompts/team-mate.md"
You are Team Mate, the developer's technical coordinator.

You own the development process. When the developer asks for work, decide
whether to do it directly or delegate it to a working agent. Delegate when the
work is substantial, isolated, or benefits from an independent pass.

## Delegating

Before delegating, define:

- A clear goal.
- At least one testable acceptance criterion.
- Relevant context the worker needs.
- Constraints and non-goals.

Use the team_mate tools. Do not describe delegation without performing it.

## Reviewing

When you receive a review request, do not trust the worker's summary. Inspect
the repository directly. Check:

- Bugs and incorrect behavior.
- Every acceptance criterion.
- Regressions and unexpected side effects.
- Edge cases and error handling.
- Scope: did the worker change more or less than requested?
- Tests: do they exist and do they pass?

Record findings with team_mate_submit_review. A pass verdict requires no open
blocker or major findings.

## Approving

Never approve work on the developer's behalf. When a task is ready, present a
concise report:

- What was requested.
- What changed.
- What you reviewed.
- What was found and fixed.
- Remaining concerns.
- Your assessment.

Then ask the developer to approve, request changes, reject, or finalize. Record
their decision with team_mate_decide.

## Boundaries

- Do not commit, push, or merge without an explicit finalize decision.
- Do not hide failures.
- Keep the developer informed without flooding them with worker chatter.
```

## Worker agent

The worker executes one task and reports. It focuses on the assignment.

### Responsibilities

1. Read the brief and inspect the relevant code.
2. Implement the smallest correct change.
3. Validate with tests or an equivalent check.
4. End with a structured report.
5. Address review feedback and repeat.

### System prompt

```markdown title="prompts/team-mate-worker.md"
You are a working agent for Team Mate. You execute one delegated task.

## Rules

1. Read the task brief and acceptance criteria carefully.
2. Inspect the repository before changing anything.
3. Make the smallest change that satisfies the goal. Do not expand scope.
4. Validate your work. Run the project's tests or an equivalent check.
5. Do not commit, push, or open a pull request.
6. Do not delegate or review. Do not call team_mate tools.
7. If you are blocked, say so clearly instead of guessing.

## Report

End every task with this exact structure:

STATUS: succeeded | failed | blocked
SUMMARY: <one paragraph describing what you did>
CHANGES: <files changed and why>
VALIDATION: <commands run and their results>
CONCERNS: <anything the reviewer should check>
```

## Model selection

Use a stronger model for the primary agent because it reviews and decides. Use
a faster, cheaper model for workers when the task allows.

```jsonc
{
  "agents": {
    "team-mate": { "model": "anthropic/claude-sonnet-4-5" },
    "team-mate-worker": { "model": "anthropic/claude-haiku-4-5" }
  }
}
```

Set a fallback in plugin options so a task can specify a model without editing
config. The `team_mate_delegate_task` input can accept an optional model, which
the orchestrator passes to `ctx.session.create({ model })`.

## Commands

Commands give the developer shortcuts that do not require prose. Register them
with `ctx.command.transform`. Each command receives the invoking session and
prompt and returns an Effect.

```ts title="src/commands.ts"
export const registerCommands = (ctx: Context, store: Store, orch: Orchestrator) =>
  ctx.command.transform((editor) => {
    editor.add({
      name: "team",
      description: "Show the Team Mate task board",
      execute: ({ sessionID }) =>
        Effect.gen(function* () {
          const tasks = yield* store.listTasks()
          yield* ctx.session.synthetic({
            sessionID,
            text: formatTaskBoard(tasks),
            delivery: "queue",
          })
        }),
    })

    editor.add({
      name: "delegate",
      description: "Delegate the described work to a worker",
      execute: ({ sessionID, prompt }) =>
        ctx.session.synthetic({
          sessionID,
          text:
            `Delegate the following work using team_mate_delegate_task. ` +
            `Define acceptance criteria first.\n\n${prompt.text}`,
          delivery: "queue",
          resume: true,
        }),
    })

    editor.add({
      name: "report",
      description: "Print the Team Mate report for a task",
      execute: ({ sessionID, prompt }) =>
        Effect.gen(function* () {
          const report = yield* store.buildReport(prompt.text.trim())
          yield* ctx.session.synthetic({ sessionID, text: report, delivery: "queue" })
        }),
    })

    editor.add({
      name: "approve",
      description: "Approve a Team Mate task",
      execute: ({ sessionID, prompt }) =>
        Effect.gen(function* () {
          yield* orch.decide({
            taskID: prompt.text.trim(),
            decision: "approve",
          })
          yield* ctx.session.synthetic({
            sessionID,
            text: `Task ${prompt.text.trim()} approved.`,
            delivery: "queue",
          })
        }),
    })
  })
```

Registering a command adds it to the command list. It is available as a slash
command in the client.

### Command conventions

- **`/team`** with no argument shows the board.
- **`/delegate <goal>`** routes the goal to the primary agent, which fills in
  the criteria.
- **`/report <taskID>`** prints the full report.
- **`/approve <taskID>`** and **`/reject <taskID>`** record a decision.

Commands are convenience. Every command is also reachable by talking to the
primary agent.

## Skills

Optionally register a skill that documents the delegation protocol. A skill is
useful when the developer wants to invoke the workflow explicitly.

```ts title="src/skills.ts"
import { Skill } from "@opencode/plugin/effect"

export const registerSkill = (ctx: Context) =>
  ctx.skill.transform((editor) => {
    editor.add(
      Skill.Info.make({
        id: "team-mate-delegate",
        name: "Team Mate delegate",
        description: "Delegate a scoped task to a Team Mate worker",
        location: "teammate/skills/delegate.md",
        content:
          "Turn the request into a task with acceptance criteria, then call " +
          "team_mate_delegate_task. Review the result before approving.",
        autoinvoke: false,
      }),
    )
  })
```

Keep this optional. Agents already receive the protocol through their system
prompts.

## Agent transforms

The plugin can adjust configured agents at load time. The Effect agent editor
supports `default`, `update`, and `remove`, but not `add`. Define agents in
config and use transforms only for adjustments.

```ts
yield* ctx.agent.transform((editor) => {
  if (editor.get("team-mate-worker")) {
    editor.update("team-mate-worker", (agent) => {
      agent.description = "Executes one delegated Team Mate task"
    })
  }
})
```

If a required agent is missing, log a clear error and register the tools
anyway. The tools fail with an actionable message until the agent is configured.
