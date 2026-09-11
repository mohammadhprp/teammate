# Team Mate

## Vision

**Team Mate is an AI-powered engineering teammate that turns a single conversation into a coordinated software development workflow.**

The goal is to let a developer communicate with **one primary agent** while Team Mate handles the coordination of other agents working on the developer's behalf.

Instead of the developer manually creating sessions, assigning tasks, checking progress, reviewing changes, finding bugs, and repeatedly sending feedback to another agent, Team Mate manages this workflow automatically.

The developer should be able to say:

> "Implement this feature."

And Team Mate should take responsibility for turning that request into a controlled development process.

---

## The Problem

Working with AI coding agents often requires the developer to act as the coordinator.

A typical workflow looks like:

1. Create or open an agent session.
2. Explain the task.
3. Wait for the agent to finish.
4. Inspect what it changed.
5. Find problems or missing requirements.
6. Send feedback.
7. Wait again.
8. Review the changes again.
9. Decide whether the work is acceptable.
10. Tell the agent what to do next.
11. Commit or otherwise finalize the work.

This creates a significant amount of coordination overhead.

The developer becomes the **project manager, reviewer, tester, and messenger** between themselves and the coding agent.

Team Mate exists to remove this coordination burden.

---

## The Product

Team Mate introduces a **primary agent** that acts as the developer's single point of interaction.

The primary agent understands the developer's request and takes responsibility for coordinating the work.

When a task requires implementation, the primary agent creates a **dedicated working session** for another agent.

The working agent receives the task, works independently, and reports its progress through its session.

The primary agent remains responsible for the overall task.

The developer does not need to directly interact with the working agent.

---

## Core Workflow

The intended workflow is:

```text
Developer
    │
    ▼
Primary Agent
    │
    ├── Create Working Session
    │
    ▼
Working Agent
    │
    ├── Implement
    ├── Investigate
    ├── Test
    └── Report
    │
    ▼
Primary Agent
    │
    ├── Review
    ├── Identify Bugs
    ├── Identify Missing Requirements
    └── Provide Feedback
    │
    ▼
Working Agent
    │
    ├── Fix Issues
    └── Rework
    │
    ▼
Primary Agent
    │
    └── Final Review
    │
    ▼
Developer
```

The important principle is that **the primary agent owns the process**.

---

## Delegation

The developer should not need to think about which agent should perform a task.

The primary agent determines when work should be delegated and creates the appropriate working session.

The delegated task should contain enough context for the working agent to understand:

- What needs to be accomplished
- Why it needs to be accomplished
- The expected outcome
- Relevant requirements
- Constraints
- Acceptance criteria
- Any information discovered by the primary agent

The working agent should be able to begin working without requiring the developer to repeat the original request.

---

## Monitoring

After delegating work, the primary agent should remain aware of the working session.

It should be able to determine:

- Whether the agent is still working
- What progress has been made
- Whether the task appears complete
- Whether the agent encountered a problem
- Whether additional intervention is required
- Whether the result is ready for review

The developer should not have to continuously monitor the working session.

Team Mate should make the delegated agent feel like a **member of the team working in the background**.

---

## Review

Completing a task is not the same as completing it correctly.

When the working agent reports that the task is complete, the primary agent performs an independent review.

The review should look for:

- Bugs
- Incorrect behavior
- Missing requirements
- Incomplete implementation
- Unexpected side effects
- Poor handling of edge cases
- Regressions
- Inconsistencies with the requested scope
- Work that does not actually satisfy the original task

The primary agent should not simply accept the working agent's claim that the task is complete.

It should act as a **second pair of eyes**.

---

## Feedback Loop

If the review identifies problems, the primary agent sends the findings back to the working agent.

The working agent then continues the task and addresses the identified issues.

The cycle can repeat:

```text
Work
  ↓
Review
  ↓
Issues Found?
  ├── Yes → Feedback → Fix → Review
  └── No  → Final Result
```

The objective is to move the task toward a state where the primary agent is confident that the requested work has been completed correctly.

---

## Human Approval

The developer remains the final decision-maker.

Team Mate should not hide the work performed by the agents.

When the work reaches a reviewable state, the primary agent presents the developer with a clear report containing:

- What was requested
- What was implemented
- What the working agent changed
- What was reviewed
- Issues that were discovered
- Issues that were fixed
- Remaining concerns
- The final assessment of the work

The developer can then decide what should happen next.

For example:

- Approve the work
- Request additional changes
- Reject the implementation
- Ask for another review
- Ask the agent to finalize the work
- Commit the changes
- Continue development

The developer remains **in control of consequential decisions**.

---

## The Primary Agent

The primary agent is more than a conversational interface.

It acts as the **technical coordinator** of the development process.

Its responsibilities include:

- Understanding the developer's intent
- Breaking work into actionable tasks when necessary
- Creating working sessions
- Assigning work
- Providing context
- Monitoring progress
- Reviewing results
- Finding problems
- Sending feedback
- Coordinating iterations
- Producing a final report
- Waiting for developer approval
- Executing the next requested action

The primary agent should behave like a **senior teammate responsible for making sure the work gets done correctly**, rather than simply passing messages between the developer and another agent.

---

## Working Agents

Working agents are temporary or persistent team members responsible for executing delegated work.

They focus on the task assigned to them.

A working agent should:

1. Understand its assignment.
2. Inspect the relevant project context.
3. Perform the work.
4. Validate the result.
5. Report what it did.
6. Respond to review feedback.
7. Continue working until the task reaches an acceptable state.

The working agent should not require the developer's direct involvement for normal development iterations.

---

## Separation of Responsibilities

Team Mate creates a separation between **execution and supervision**.

### Developer

Defines the goal and makes final decisions.

### Primary Agent

Coordinates, supervises, reviews, and communicates with the developer.

### Working Agent

Executes the assigned work.

This separation allows each participant to focus on a different responsibility.

```text
Developer
  └── Defines intent & approves outcome

Primary Agent
  └── Coordinates & reviews

Working Agent
  └── Executes
```

---

## Transparency

Automation should never come at the cost of visibility.

The developer should be able to understand what happened during a task.

Team Mate should preserve the important history of:

- The original request
- Delegated tasks
- Agent sessions
- Progress
- Reviews
- Feedback
- Fixes
- Final decisions

The developer should be able to trace the path from **request → implementation → review → approval**.

---

## Trust

The central purpose of Team Mate is not simply to automate more work.

It is to make autonomous development **more trustworthy**.

Trust comes from multiple layers:

**Execution**

An agent performs the work.

**Verification**

Another agent reviews the result.

**Iteration**

Problems are sent back for correction.

**Transparency**

The developer can see what happened.

**Approval**

The developer remains in control of the final outcome.

Team Mate should make it possible to delegate work without feeling like the developer has lost control of it.

---

## Long-Term Vision

Team Mate should evolve toward the experience of having a **virtual engineering team** available through a single conversation.

The developer should be able to communicate goals at a high level while Team Mate handles the operational complexity behind those goals.

Instead of:

> "I need to manage several AI agents."

The experience should be:

> "I have a teammate who manages the work for me."

The ultimate goal is to make AI-assisted software development feel less like operating a collection of tools and more like **working with a capable engineering team**.

---

## Guiding Principle

> **One conversation for the developer. A coordinated team behind it.**

Team Mate should make delegation, execution, review, iteration, and approval feel like one continuous development workflow rather than a collection of disconnected agent sessions.