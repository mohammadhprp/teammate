# Agent lifecycle

Team Mate should treat agents as dynamic workers with a lifecycle managed
through Herdr.

## Proposed lifecycle

```text
planned
  ↓
created
  ↓
working
  ↓
waiting / blocked
  ↓
completed
  ↓
reviewing
  ↓
rework ──→ working
  ↓
accepted / escalated / stopped
```

Not every task needs every state.

## Creation

Before creating an agent, Team Mate should know:

- target project;
- objective;
- expected output;
- relevant constraints;
- required project context;
- whether parallel work is useful.

## Monitoring

Monitoring should combine agent state with useful output. An idle agent is not
necessarily successful, and active output is not necessarily progress.

Team Mate should detect:

- completion;
- failure;
- blocked work;
- inactivity;
- repeated errors;
- unexpected scope changes.

## Review and rework

When work is important enough to review, Team Mate should give the reviewer the
original objective and enough evidence to independently assess the result.
Findings become a new assignment for the worker or another specialist.

## Stopping

Team Mate should be able to stop unnecessary or unsafe agents. Long-running or
repeatedly failing agents should not continue indefinitely.

## R&D questions

- What Herdr signals are reliable for lifecycle state?
- How should timeouts be chosen?
- How should a blocked agent be distinguished from a slow agent?
- What should happen when the primary Team Mate session disappears?
- How should orphaned agents be recovered?
