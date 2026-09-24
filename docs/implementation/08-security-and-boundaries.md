# Security and boundaries

Team Mate can create and control many agents, so the main security concern is
limiting unintended scope.

## Project boundary

Every worker should have an explicit target project. Team Mate should avoid
accidentally giving a worker access to unrelated repositories, credentials, or
context.

## Agent boundary

Agents should receive the minimum capabilities needed for their assignment.
Specialized review or investigation agents do not automatically need the same
write authority as implementation agents.

## Consequential actions

Actions such as publishing, merging, deleting important resources, changing
production infrastructure, or exposing secrets should require explicit policy
and, where appropriate, developer approval.

## Shared skills

Shared Team Mate skills must be treated as executable instructions and reviewed
accordingly. A skill should not silently expand an agent's permissions.

## Harness boundary

Team Mate should use the harness's supported subagent mechanisms rather than
inventing hidden session-control mechanisms. R&D should document which
operations are safe for agents to invoke automatically.

## R&D questions

- What permissions can a harness expose to workers?
- How should dangerous operations be gated?
- How should secrets be protected from worker output and reports?
- How should a compromised or misbehaving worker be stopped?
- What audit information is required for consequential actions?
