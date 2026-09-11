# Team Mate implementation

This directory contains the technical design for Team Mate, an OpenCode v2
plugin that coordinates a primary agent, one or more working agents, and an
iterative review loop.

The design builds on [VISION.md](../VISION.md) and targets the
[OpenCode v2 Effect plugin API](https://opencode.ai/v2/docs/build/plugins/effect/)
and the [OpenCode v2 HTTP API](https://opencode.ai/v2/docs/api).

## Reading order

1. [Architecture](01-architecture.md) describes the components, roles, and
   flow of a task.
2. [Plugin anatomy](02-plugin-anatomy.md) maps Team Mate onto the Effect plugin
   lifecycle, context domains, and configuration.
3. [Domain model](03-domain-model.md) defines the persisted types and state
   machine.
4. [Tools](04-tools.md) specifies the tools the primary agent calls.
5. [Orchestration](05-orchestration.md) describes the background engine that
   delegates, monitors, reviews, and iterates.
6. [Agents and commands](06-agents-and-commands.md) configures the primary
   agent, the worker agent, and slash commands.
7. [Review and approval](07-review-and-approval.md) defines the review protocol,
   the feedback loop, and the developer approval gate.
8. [Security and isolation](08-security-and-isolation.md) covers permissions,
   work isolation, and blast radius.
9. [Roadmap](09-roadmap.md) phases delivery and lists open questions.
10. [API mapping](10-api-mapping.md) maps every Team Mate operation to a v2 API
    call.

## Summary

Team Mate is a location-scoped OpenCode plugin. It registers a tool namespace
and two agents, then runs a supervised background engine that:

1. Creates a worker session for each delegated task.
2. Sends the worker a structured brief.
3. Watches the worker until it goes idle.
4. Asks the primary agent to review the result.
5. Routes review findings back to the worker.
6. Repeats until the primary agent passes the work.
7. Presents a report to the developer and waits for a decision.

The developer talks to one agent. The plugin coordinates the rest.

## Design principles

- **The primary agent owns the process.** The plugin is deterministic
  infrastructure; the primary agent makes quality judgments.
- **The developer owns consequential decisions.** The plugin never merges,
  commits, or finalizes without an explicit developer decision.
- **Evidence over claims.** A worker saying "done" moves the task to review, not
  to approval.
- **Everything is traceable.** Task state, reviews, findings, feedback, and
  decisions persist in plugin storage.

## Assumptions

This design assumes a greenfield repository. It documents API surface from the
OpenCode v2 documentation as of the linked pages. Where the public Effect
plugin surface is narrower than the HTTP API, [API mapping](10-api-mapping.md)
records the gap and a mitigation. Verify signatures against the installed
`@opencode/plugin` package before implementation.
