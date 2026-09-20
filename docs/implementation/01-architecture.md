# Architecture

Team Mate is the primary agent. It is not an OpenCode plugin, and it is not a
fixed orchestration service — nor an agent runtime. It is a reusable operating
model built from skills, scripts, instructions, and workflows that the primary
agent runs on a pluggable worker runtime.

## Components

| Component | Responsibility |
| --- | --- |
| Developer | Defines goals and makes consequential decisions. |
| Team Mate | Primary agent that plans, delegates, monitors, reviews, and reports. |
| Worker agents | Dynamically created agents that execute specialized work. |
| Team Mate skills | Shared capabilities for coordination and engineering workflows. |
| Project skills | Capabilities specific to the target project. |
| Project context | `AGENTS.md`, `CONTEXT.md`, docs, commands, and conventions. |
| Worker runtime | `tm` selects the backend (`--runtime`, `TM_RUNTIME`, `team-mate.toml`, then autodetect): Herdr by default, or a headless Claude backend. |
| Claude plugin | The overlay packaged for Claude Code and Cowork: skills, worker subagents, a `bin/tm` wrapper, and best-effort hooks. |

## Control flow

```text
Developer
   │
   ▼
Team Mate
   │
   ├── Understand request
   ├── Identify project context
   ├── Plan / delegate
   │
   ▼
Runtime (Herdr default)
   │
   ├── Agent A ── implementation
   ├── Agent B ── review
   └── Agent C ── investigation
   │
   ▼
Team Mate
   │
   ├── Collect progress / output
   ├── Review results
   ├── Request rework when needed
   └── Report important state
   │
   ▼
Developer
```

## Multi-project model

A single Team Mate session can coordinate several projects. Each delegated
agent receives the context of the project it is working on.

```text
Team Mate
├── Project A
│   ├── AGENTS.md
│   ├── CONTEXT.md
│   ├── local skills/scripts
│   └── agents
│
├── Project B
│   ├── AGENTS.md
│   ├── CONTEXT.md
│   ├── local skills/scripts
│   └── agents
│
└── shared Team Mate skills/scripts
```

Project context must remain scoped to the relevant project. Shared Team Mate
capabilities may be used by agents in any project.

## Agent model

There is deliberately no fixed worker hierarchy. Team Mate can create one or
many agents and can choose any useful specialization.

Examples include:

- implementation;
- code review;
- debugging;
- testing;
- investigation;
- planning;
- documentation;
- security review;
- performance analysis.

The role is determined by the assignment, not by a hard-coded Team Mate agent
type.

## Responsibility boundary

Team Mate owns **judgment and coordination**. The worker runtime owns the
**agent runtime** (Herdr by default, or the headless Claude backend). Project
repositories own **project-specific knowledge and execution rules**.

This boundary should prevent Team Mate from growing into another general agent
runtime.

## R&D questions

- How should Team Mate discover available Herdr capabilities?
- How should it choose between serial and parallel agents?
- How should it associate an agent with a project safely?
- How should task state survive the primary agent's session ending?
- Which workflow state needs persistence versus relying on agent history?
- What is the minimum useful shared skill set?
