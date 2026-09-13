# Multi-project context

One Team Mate session may coordinate work across multiple projects. Context
isolation is therefore a core design problem.

## Context layers

```text
Team Mate shared context
        │
        ├── Project A context
        │     ├── AGENTS.md
        │     ├── CONTEXT.md
        │     └── local skills/scripts
        │
        └── Project B context
              ├── AGENTS.md
              ├── CONTEXT.md
              └── local skills/scripts
```

A worker should receive only the project context required for its assignment,
plus the shared Team Mate capabilities.

## Project identity

Every delegated task should have an explicit project identity. Relying only on
the agent's current working directory is risky when one primary agent manages
several projects.

## Context precedence

Research should establish a deterministic precedence model for conflicting
instructions. A likely model is:

1. platform/system constraints;
2. Team Mate coordination rules;
3. target project instructions;
4. task-specific instructions.

This should be validated against the actual coding-agent environment.

## Cross-project work

Team Mate may coordinate a task spanning projects, but each worker should still
have a clearly defined project scope. Cross-project workers should explicitly
identify which repositories they can modify.

## R&D questions

- How should Team Mate discover project context automatically?
- How should context be passed to agents without duplicating large documents?
- How should a project be selected when the developer uses an informal name?
- How should cross-project dependencies be represented?
- What information must never cross project boundaries?
