# Next steps

Current state: Team Mate has moved from an OpenCode-plugin design to a
Herdr-based primary-agent model. The repository is now focused on R&D,
reusable skills, scripts, workflows, and project-context conventions.

## 1. Validate Herdr workflows

Use a real Team Mate session to create multiple agents, monitor them, collect
results, and coordinate review/rework.

## 2. Define the first shared skills

Identify the smallest useful set of Team Mate skills. Start with delegation,
monitoring, review, and reporting before adding specialized workflows.

## 3. Validate multi-project operation

Run one Team Mate session against multiple projects. Verify that each worker
loads the correct `AGENTS.md`, `CONTEXT.md`, local skills, and scripts without
mixing unrelated project context.

## 4. Research reliability

Study cancellation, failure recovery, timeouts, blocked agents, orphaned
agents, and persistent task history.

## 5. Research portability

Validate the operating model across OpenCode, Codex, and Pi where practical.
Avoid relying on behavior that only one coding-agent environment provides unless
there is a deliberate compatibility decision.

## 6. Keep implementation minimal

Do not build a dedicated Team Mate runtime until experiments demonstrate that
skills, scripts, Herdr, and agent instructions are insufficient.
