# Reporting and observability

Team Mate should make autonomous coordination understandable without flooding
the developer with low-level events.

## Developer report

An important report should answer:

- What was requested?
- Which projects were involved?
- Which agents were created?
- What is their current state?
- What important work was completed?
- What was reviewed?
- What findings were fixed or remain?
- Are there blockers or risks?
- What should happen next?

## Progress

Progress should be event-driven where possible. Useful events include agent
creation, meaningful status changes, completion, failure, review findings,
rework, and escalation.

## Logs

Logs are supporting evidence, not the primary user interface. Team Mate should
surface relevant excerpts when they explain a failure, blocker, or unexpected
behavior.

## History

Long-term R&D should investigate whether a persistent task timeline is needed
and what minimum information it should retain.

A useful conceptual record is:

```text
request
  → delegation
  → agent events
  → result
  → review
  → rework
  → final report
  → developer decision
```

## R&D questions

- What should be persisted?
- Where should history live?
- How much agent output should be retained?
- How should multiple projects be represented in one timeline?
- How can the developer inspect a task without opening every worker session?
