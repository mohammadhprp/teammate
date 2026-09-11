# Roadmap

The roadmap delivers the vision in verifiable phases. Each phase has a goal and
a check. Do not start a phase until the previous check passes.

## Phase 0: Spike

**Goal:** Confirm the Effect plugin API and the orchestration primitives against
the target OpenCode release.

Tasks:

1. Create a plugin that logs on load and unload.
2. Register one tool and confirm the primary agent can call it.
3. Confirm the tool context exposes `sessionID`.
4. Create a session, prompt it, wait for idle, and read the outcome.
5. Subscribe to events and log types and payloads.
6. Read a VCS diff.
7. Write and scan a storage record.

**Check:** A throwaway task runs end to end: delegate a trivial prompt to a
worker session, wait for idle, and print the outcome.

**Why first:** The design depends on the tool context, `session.wait`, and
event payload shapes. Confirm them before building the state machine.

## Phase 1: Delegate and observe

**Goal:** The primary agent can delegate a task and report progress.

Tasks:

1. Define the domain schemas.
2. Implement the store and recovery.
3. Implement the tool namespace with `delegate_task`, `list_tasks`, and
   `get_task`.
4. Implement the orchestrator command queue and the delegation path.
5. Implement worker monitoring with `session.wait`.
6. Implement the event consumer for progress.

**Check:** The developer says "implement X." The primary agent delegates,
creates a worker session, and reports the task ID. The developer can ask for
status and see live progress. The task reaches `awaiting_review` when the
worker is idle.

## Phase 2: Review loop

**Goal:** Review and rework happen automatically.

Tasks:

1. Implement evidence collection.
2. Implement the review request.
3. Implement `submit_review` with verdict rules.
4. Implement the feedback prompt and the rework cycle.
5. Enforce the iteration limit and escalation.

**Check:** A worker produces a deliberately incomplete result. The primary
agent finds the gap, sends feedback, the worker fixes it, and the second review
passes. The full loop runs without developer involvement.

## Phase 3: Approval and reporting

**Goal:** The developer approves or redirects with full context.

Tasks:

1. Implement `request_approval` and the report builder.
2. Implement `decide` and decision handling.
3. Implement the timeline and report formatting.
4. Register the `/team`, `/delegate`, `/report`, and `/approve` commands.

**Check:** A task reaches `ready_for_approval`. The developer receives a report
that covers request, change, review, findings, and remaining concerns, then
approves or requests changes. The decision is recorded.

## Phase 4: Hardening

**Goal:** The workflow is trustworthy under interruption and limits.

Tasks:

1. Implement recovery for `working` and `reviewing` tasks on load.
2. Implement cancellation and interruption handling.
3. Implement concurrency limits and per-task mutexes.
4. Add structured logging and metrics for every transition.
5. Add tests for the state machine, store recovery, and verdict rules.
6. Write the operator guide for permissions and limits.

**Check:** Killing and reloading the plugin mid-task leaves recoverable state
and notifies the primary agent. A failed worker is surfaced, not swallowed.

## Phase 5: Isolation

**Goal:** Support concurrent workers safely.

Tasks:

1. Add per-task worktree creation.
2. Create worker sessions at the worktree location.
3. Diff each task against its recorded base revision.
4. Clean up worktrees on approval, rejection, or cancellation.

**Check:** Two tasks run concurrently in separate worktrees, each review sees
only its own diff, and cleanup leaves no orphaned worktrees.

## Phase 6: Long-term vision

Candidates, not commitments:

- Persistent workers reused across tasks.
- Task graphs with dependencies between tasks.
- Specialist workers selected by task type.
- A task board view in the client.
- Cost and token budgets per task.
- Cross-project coordination.

## Open questions

1. **Tool context fields.** Does the Effect plugin tool context expose
   `sessionID` under that name? Phase 0 confirms it.
2. **Event payload shape.** V2 events are encoded strings. Confirm the decoded
   shape and the field that identifies a session.
3. **Event names.** Confirm the exact names for message and session updates in
   the target release.
4. **Worker report capture.** Without a message-history method in the Effect
   session domain, confirm that assistant text can be captured from
   `message.part.updated` events. If not, add a fallback to read the worker
   session through the client.
5. **Agent transform `add`.** Agents have no `add` in the editor, so they must
   be configured. Confirm the v2 config key is `agents`.
6. **Permission hook.** Decide whether to accept static permissions or add a
   companion Promise plugin for dynamic policy.
7. **Worktree API.** Decide between shell, HTTP, or a companion plugin for
   worktree creation in Phase 5.
8. **Command argument shape.** Confirm whether commands receive `arguments` or
   `text`, and how the prompt is delivered.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| API drift between docs and release | Build breaks | Phase 0 spike. Pin versions. |
| Missed events skip a review | Stuck tasks | `session.wait` owns completion. |
| Shared checkout mixes diffs | False reviews | v1 single worker, base-revision diffs. |
| Review becomes a rubber stamp | Untrustworthy approval | Checklist, evidence, no self-approval. |
| Runaway iterations or cost | Wasted spend | Hard limits and visible escalation. |
| Large diffs flood the context | Poor reviews | Diff stats plus targeted file reads. |

## Definition of done for v1

Team Mate is ready when a developer can:

1. Ask for a feature in one message.
2. Receive a report that shows what was requested, changed, reviewed, found,
   fixed, and what remains.
3. Approve, request changes, or reject.
4. Trace the whole process from the timeline.

And the system does this without the developer creating sessions, checking
progress, or relaying feedback by hand.
