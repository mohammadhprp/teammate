# Team Mate research and implementation

This directory contains the long-term R&D for Team Mate.

Team Mate is a primary AI engineering agent that coordinates dynamically
created agents across multiple projects. Herdr is the current runtime used for
agent orchestration. The Team Mate repository provides reusable skills, scripts,
workflows, instructions, and conventions rather than an OpenCode plugin.

The implementation is intentionally **research-driven**. We should validate the
operating model with real agents before committing to a large framework.

## Reading order

1. [Architecture](01-architecture.md) — the proposed responsibility boundaries
   between the developer, Team Mate, workers, project context, and Herdr.
2. [Skill system](02-skill-system.md) — how shared Team Mate skills and
   project-local skills should compose.
3. [Agent lifecycle](03-agent-lifecycle.md) — research into creating,
   monitoring, reviewing, reworking, and stopping agents.
4. [Multi-project context](04-multi-project-context.md) — isolation and context
   loading when one Team Mate session works across projects.
5. [Workflows](05-workflows.md) — reusable delegation, implementation, review,
   debugging, testing, and investigation workflows.
6. [Reporting and observability](06-reporting-and-observability.md) — progress,
   logs, reports, and workflow history.
7. [Review and approval](07-review-and-approval.md) — evidence, findings,
   verdicts, rework, and developer approval.
8. [Security and boundaries](08-security-and-boundaries.md) — permissions,
   trust boundaries, and safe autonomous operation.
9. [R&D roadmap](09-rd-roadmap.md) — experiments, open questions, and proposed
   milestones.
10. [Skills plan](10-skills-plan.md) — the common, teammate, and worker skills
    we need, with per-skill specifications and build order.
11. [Process review](11-process-review.md) — a real run reviewed: what worked,
    what broke, and the prioritized plan to improve the process.
12. [Parallel run review](12-parallel-run-review.md) — two projects at once:
    what the parallel run exposed, and the next improvement plan.
13. [Audit and improvement plan](13-audit-and-improvement-plan.md) — the docs,
    config, skills, and `tm` code audited against what they enforce, with a
    prioritized plan.
14. [Open questions](14-open-questions.md) — resolutions and bounded experiments
    for the remaining research questions.
15. [Minimum skill set experiment](15-minimum-skill-set-experiment.md) — the
    runnable protocol for the first experiment: the worker skill floor.

## Core architecture

```text
Developer
    │
    ▼
Team Mate
(primary agent)
    │
    ├── Project A ──┬── Agent A1
    │                └── Agent A2
    │
    └── Project B ──┬── Agent B1
                     └── Agent B2

Shared Team Mate skills/scripts
            │
            ▼
         Herdr
      agent runtime
```

Team Mate decides what work needs to happen and which agents are useful. Herdr
provides the runtime mechanisms for operating those agents. Project-local
context defines how work should be performed in each project.

## Responsibility boundaries

### Developer

Defines goals, supplies intent, receives important reports, and makes final
consequential decisions.

### Team Mate

Understands the goal, plans and delegates work, creates agents, monitors them,
coordinates reviews and rework, and reports progress and results.

### Worker agents

Execute specialized assignments. They can be implementation agents, reviewers,
debuggers, testers, investigators, planners, documentation agents, or any
other role Team Mate determines is useful.

### Herdr

Provides the agent orchestration runtime. Team Mate should use Herdr rather
than implementing another agent-session runtime.

### Target project

Provides its own `AGENTS.md`, `CONTEXT.md`, skills, scripts, code, and domain
knowledge.

## Design principles

- **One primary agent.** The developer interacts with Team Mate rather than
  manually coordinating workers.
- **Dynamic teams.** There is no fixed set of worker agents.
- **Multiple projects.** A Team Mate session may coordinate independent project
  contexts.
- **Shared plus local knowledge.** Team Mate capabilities compose with the
  target project's capabilities.
- **Verification.** Agent completion is a signal to inspect the result, not
  proof that the task is correct.
- **Observable autonomy.** Important progress, logs, decisions, and outcomes
  should be available to the developer.
- **Developer control.** Consequential decisions remain with the developer.
- **Research before abstraction.** Build only after workflows have been
  validated through experiments.

## What this repository should not become

At this stage, avoid turning Team Mate into:

- an OpenCode plugin;
- a replacement for Herdr;
- a mandatory application or daemon;
- a fixed collection of predefined agents;
- a large orchestration framework built before the workflows are understood.

Those may become useful later, but they are not current assumptions.
