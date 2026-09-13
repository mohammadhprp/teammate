# Team Mate vision

**Team Mate is a primary AI engineering agent that manages a team of other
agents across multiple software projects.**

The developer talks to one Team Mate session through a coding agent such as
OpenCode, Codex, or Pi. Team Mate understands its role from `AGENTS.md`, uses
shared Team Mate capabilities, and uses Herdr as the agent orchestration
runtime.

Team Mate is not itself an OpenCode plugin. The repository is a collection of
skills, scripts, workflows, prompts, and documentation that make the Team Mate
operating model reusable across coding-agent environments.

## Core idea

```mermaid
flowchart TD
    D[Developer]
    TM[Team Mate<br/>Primary Agent]

    D --> TM

    TM --> PA[Project A]
    TM --> PB[Project B]
    TM --> PC[Project C]

    PA --> A1[Agent A1]
    PA --> A2[Agent A2]

    PB --> B1[Agent B1]
    PB --> B2[Agent B2]

    PC --> C1[Agent C1]
```

## The problem

Working with multiple AI coding agents normally makes the developer responsible
for coordination:

1. Decide which agent should do each task.
2. Create and configure sessions.
3. Give agents enough project context.
4. Monitor their progress.
5. Collect results and logs.
6. Review their work.
7. Send feedback and request fixes.
8. Coordinate work across projects.
9. Decide when the overall task is complete.

Team Mate should take responsibility for this coordination while keeping the
developer informed and in control.

## The Team Mate role

Team Mate is the **primary agent**, not a fixed worker or a predefined team.

It can create as many agents as necessary and choose the type of agent based on
the task. An agent may be used for implementation, review, debugging, testing,
investigation, planning, documentation, or any other useful role.

Team Mate decides:

- when to delegate work;
- how many agents are useful;
- which project each agent should work on;
- what context each agent needs;
- when an agent should be monitored or queried;
- when work should be reviewed;
- when another agent should fix a problem;
- when the developer needs to be informed or asked to decide.

## Multi-project operation

One Team Mate session can coordinate work across multiple projects.

For example:

```text
Developer
    │
    ▼
Team Mate
    │
    ├── Project A
    │     ├── Agent A1
    │     └── Agent A2
    │
    └── Project B
          ├── Agent B1
          └── Agent B2
```

A project has its own context and instructions. Agents created for that project
must use that project's `AGENTS.md`, `CONTEXT.md`, skills, scripts, and other
relevant resources.

Team Mate's shared skills and scripts are available in addition to the
project-specific resources.

The goal is to prevent unrelated project context from leaking between projects
while still allowing Team Mate to coordinate the overall work.

## How a session starts

The developer can open a normal coding-agent session and say what they want.
The repository's `AGENTS.md` establishes that the agent is operating as Team
Mate.

Conceptually:

```text
Developer opens OpenCode / Codex / Pi
                │
                ▼
        AGENTS.md is loaded
                │
                ▼
       Agent assumes Team Mate role
                │
                ▼
      Developer gives a task or goal
                │
                ▼
       Team Mate coordinates work
```

There is no requirement for the developer to manually create every worker
session.

## Herdr as the runtime

Herdr provides the runtime capabilities Team Mate needs to coordinate agents.
Team Mate should build on those capabilities rather than reimplementing an
agent runtime or creating an OpenCode-specific plugin.

The Team Mate repository should therefore focus on the **coordination layer**:

- reusable skills;
- reusable scripts;
- agent instructions;
- workflows;
- project-context conventions;
- review protocols;
- monitoring and reporting patterns;
- experiments and research.

Herdr is an implementation dependency of the coordination model, not the
product itself.

## Shared and project-specific capabilities

There are two layers of agent knowledge.

### Team Mate layer

Shared capabilities that can be reused across projects, such as:

- agent creation and coordination;
- monitoring and waiting;
- progress reporting;
- review workflows;
- delegation patterns;
- debugging workflows;
- testing workflows;
- investigation patterns;
- common scripts and utilities.

### Project layer

Capabilities belonging to one project, such as:

- project architecture;
- coding conventions;
- project-specific skills;
- scripts and commands;
- deployment knowledge;
- domain rules;
- project context;
- project-specific acceptance criteria.

The agent should combine both layers when working.

## Delegation

Team Mate should provide each agent with a clear, self-contained assignment.
The assignment should include the relevant goal, constraints, expected outcome,
acceptance criteria, and discovered context.

The created agent should also inspect the target project's own `AGENTS.md`,
`CONTEXT.md`, skills, scripts, and relevant documentation before working.

Team Mate should not assume that every task needs the same number or type of
agents. It should use the smallest useful team, while being free to create more
agents when parallelism or specialization provides value.

## Monitoring

After delegation, Team Mate remains responsible for the work it delegated.

It should be able to determine:

- whether agents are working;
- what progress they have made;
- whether they are blocked;
- whether they finished;
- what they changed;
- whether their result requires review;
- whether another intervention is needed.

Monitoring should be practical rather than noisy. Team Mate should collect
useful state, output, and logs and present them to the developer when they are
important for understanding progress or making a decision.

## Review

Agent completion is not proof of correctness.

Team Mate should use independent review when the task warrants it. A reviewer
can inspect the implementation, tests, diffs, requirements, and project
conventions and report findings back to Team Mate.

A review may result in:

- approval of the work;
- findings that require rework;
- a request for additional testing;
- a request for another specialized agent;
- escalation to the developer.

## Iteration

Team Mate can coordinate repeated work and review cycles:

```text
Delegate
   ↓
Work
   ↓
Review
   ↓
Issues?
 ┌─┴───────────┐
Yes            No
 │              │
Fix            Report
 │              │
 └──→ Review    │
                ▼
             Developer
```

The number of iterations should be bounded by practical policies and should
escalate when agents repeatedly fail to converge.

## Developer visibility

Automation must not make the process opaque.

The developer should receive a useful report when work reaches an important
state. Depending on the situation, the report can include:

- requested work;
- projects involved;
- agents created;
- current status;
- important progress;
- relevant logs or output;
- files or changes produced;
- review findings;
- fixes performed;
- remaining concerns;
- blockers;
- recommended next action.

The developer should not receive every low-level event unless requested or
useful for debugging the workflow.

## Developer control

The developer remains the final decision-maker for consequential actions.

Team Mate can autonomously coordinate normal development work, but it should
escalate when a decision requires developer intent, when the work is ambiguous,
when agents are blocked, or when an action has meaningful risk.

The developer can then:

- approve the result;
- request changes;
- ask for more investigation;
- ask for another review;
- stop the workflow;
- change the goal;
- continue working on another project.

## Transparency and traceability

A useful Team Mate system should preserve enough history to reconstruct what
happened:

```text
Request
  ↓
Plan / Delegation
  ↓
Agent Work
  ↓
Progress / Logs
  ↓
Review
  ↓
Rework
  ↓
Final Report
  ↓
Developer Decision
```

The implementation of this history is an R&D topic. The vision only requires
that the important workflow remains observable and explainable.

## Long-term vision

Team Mate should feel like a **virtual engineering manager and teammate** that
can operate across the developer's projects.

The developer should be able to say:

> "Work on project A and implement feature X."

and later:

> "Now investigate the bug in project B and have two agents look at it."

Team Mate should understand the active project context, create the appropriate
agents, coordinate them through Herdr, use the shared Team Mate capabilities,
and report the outcome.

The developer should think about **what needs to happen**, not about manually
operating a collection of agent sessions.

## Guiding principle

> **One primary agent. Many specialized agents. Multiple projects. Shared
> capabilities. The developer stays in control.**
