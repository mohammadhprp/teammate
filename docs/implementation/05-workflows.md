# Workflows

Workflows are reusable patterns Team Mate can apply through skills and scripts.
They should describe outcomes and decision points rather than hard-code a fixed
team structure.

## Implementation

```text
Understand → delegate → monitor → validate → report
```

Team Mate may create one implementation agent or several specialized agents.

## Review

```text
Collect evidence → review → findings? → rework → review again
```

Review should be independent enough to catch incorrect assumptions and missing
requirements.

## Debugging

A debugging workflow should separate reproduction, investigation, hypothesis,
fix, and verification where practical.

## Testing

Testing may be delegated to a specialist when the implementation agent cannot
provide sufficient confidence or when independent validation is valuable.

## Investigation

Investigation agents should return evidence and conclusions rather than making
unrelated code changes unless explicitly assigned to do so.

## Parallel work

Parallel agents are useful when tasks are independent. Team Mate should avoid
parallel writes to the same files or shared state unless the workflow has a
clear conflict-resolution strategy.

## Workflow composition

A workflow can call other skills. For example, an implementation workflow can
compose project inspection, delegation, testing, and review skills.

## R&D questions

- Which workflows should be first-class skills?
- How should workflows communicate state between agents?
- How should parallel results be merged?
- When is independent review worth the additional agent cost?
- How should workflows be interrupted and resumed?
