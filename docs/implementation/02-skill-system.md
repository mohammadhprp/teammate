# Skill system

Team Mate should be built primarily from reusable skills and scripts rather than
from a large application runtime.

The concrete library — categorized as common, teammate, and worker skills, with
a per-skill specification — is planned in [Skills plan](10-skills-plan.md).

## Two skill layers

### Team Mate skills

Shared skills describe capabilities that are useful across projects:

- delegation;
- agent monitoring;
- progress reporting;
- review;
- debugging;
- testing;
- investigation;
- planning;
- workflow recovery.

### Project skills

Project-local skills describe how to work effectively in one repository. They
may contain architecture knowledge, commands, conventions, domain rules, or
specialized workflows.

An agent should combine the two layers rather than replacing project skills
with Team Mate skills.

## Scripts

Scripts should provide deterministic operations that are awkward or unsafe to
express entirely as prompts. They should remain small, composable, and easy to
inspect.

Potential categories include:

- harness adapter helpers;
- project inspection;
- status collection;
- log collection;
- validation;
- report generation.

Do not add a script merely to wrap a simple command that an agent can safely run
itself.

## Skill contract

A useful skill should clearly define:

1. when to use it;
2. required context;
3. available tools/scripts;
4. expected procedure;
5. expected output;
6. failure and escalation behavior.

## Open questions

- How should skills be discovered?
- Should skills be explicitly selected or exposed through a common index?
- How should versioning work?
- How should conflicting project and Team Mate instructions be resolved?
- Which skills deserve scripts versus instructions only?
