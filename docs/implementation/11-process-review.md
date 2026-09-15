# Process review: the first bootstrap-and-build run

A developer installed a primary from this repository and gave Team Mate one
task — *"a landing page for Team Mate itself in a new project; take it end to
end; actually look good"* — then only observed. This is what happened, what
worked, what broke, and what to improve.

Evidence: the site project `~/Developer/teammate-site` (three commits), the
primary's ledger at `~/.teammate/` (`tasks/`, `timeline.jsonl`, `briefs/`,
`reports/`), and the primary's own session output.

> **Status:** the improvement plan below is implemented; see
> [NEXT.md](../NEXT.md) for the item-to-change mapping.

## Outcome

- Team Mate created the project, wrote `AGENTS.md` and `CONTEXT.md` with a real
  design system, and installed three skills with the Skills CLI:
  `anthropics/skills@frontend-design`, `vercel-labs/agent-skills@web-design-guidelines`,
  `addyosmani/web-quality-skills@accessibility` (`skills-lock.json`).
- It split the work into an implementation task and an independent review task,
  delegated, reviewed with a separate worker, drove a bounded rework, and
  committed three atomic commits: project context, installed skills, the page.
- Final task: `approved`; verdict `pass`; 6 findings (1 major, 2 minor, 3 nit),
  all resolved or explicitly accepted; the timeline reconstructs the path from
  `review.started` to `task.decision`.

This directly addresses the earlier complaint ("the review was bad, the result
was bad"): the project was *prepared* first, so the worker had context and a
quality bar, and the review had something to hold it to.

## What worked

- **`bootstrap-project` is the keystone.** Before delegating, the primary read
  the project, detected the stack, installed the design skills the work needed,
  and wrote a project `AGENTS.md` with a design system, commands, and an
  acceptance bar. The result was handcrafted, not generic.
- **Acceptance criteria were checkable and included a visible one.** The task
  required responsive behavior, contrast, and *"the rendered page looks
  intentional and premium — a screenshot a person can judge."*
- **Independent review earned its cost.** A separate reviewer ran CDP network
  capture, viewport geometry, computed styles, contrast math, and screenshots,
  and caught a **fabricated CLI transcript** (raised to `major`), a 320px anchor
  offset, and a stale comment.
- **The findings/decision model held.** Findings were recorded as data, the two
  blocking ones resolved, minors accepted, the verdict derived `pass`, and the
  decision recorded — no contradiction between status and verdict.
- **Recovery without hand-holding.** It reconciled an orphaned task from an
  earlier run, and when two rework workers blocked on sandbox permission
  dialogs it **cancelled rather than answered for them**, corrected the brief,
  and restarted with no lost work.
- **Commit discipline.** Nothing was committed until the developer chose
  "Approve and commit"; then three atomic conventional commits.

## What was missing or broke

### 1. Brief and report storage is undefined, and sits outside the sandbox

The primary invented `~/.teammate/briefs/` and `~/.teammate/reports/` and wrote
there. opencode treats those as external directories, so **two permission
dialogs** interrupted the run and needed the developer to approve. Nothing in
the skills or config says where briefs and reports live; the teammate guessed,
and the guess collided with the agent sandbox.

### 2. Worker briefs pointed outside the project

`site-1`'s brief referenced the primary's `scripts/tm.py`, and a later one a
system temp dir. A worker runs inside the project and **cannot read outside it**,
so the worker blocked on permission dialogs. The primary recovered, but this is
a recurring failure class: any path outside the project in a brief will stall a
worker.

### 3. The ledger accumulates across sessions

The run began by finding an orphaned task from an earlier session and having to
reconcile it by hand (`failed` + cancelled reviewer + supersede note). Useful
behavior, wasted effort, and confusing for a developer: the ledger has no notion
of a session and no prune/archive.

### 4. No first-class brief/report commands

Briefs and reports are hand-authored markdown files written to ad-hoc paths and
referenced by absolute path in `tm send`. There is no `tm` command or documented
location, which is why (1) and (2) happen.

### 5. The primary's permissions are not provisioned

`install.sh` does not give the primary an `opencode.json` (or equivalent) that
allows its own state dir and the project `.agents/` tree. Every fresh primary
will hit the same dialogs.

### 6. Offline verification is incomplete

`html-validate`, axe/Lighthouse, screen readers, and forced-colors mode were not
exercised ("tooling not cached / offline"). The review honestly marked them
`inconclusive`, but a UI task should be able to run at least one HTML and one
accessibility check by default.

### 7. Worker evidence can be fabricated — caught, but only by luck of a deep review

One worker produced a **non-literal `tm` CLI transcript**. The independent
review caught it; a shallow review would have passed it. The evidence standard
is stated but not enforced: any pasted command output must be something the
worker actually ran.

### 8. Two skill populations share `.agents/skills`

The project has Team Mate-managed skills (tracked in the manifest) and
Skills-CLI-installed skills (tracked in `skills-lock.json`). Nothing documents
the boundary or what happens on a name collision, so a future sync or install
could surprise.

## Improvement plan

Ordered; each names the owning surface and the gate that proves it.

### P0

- **A1 — Define where briefs and reports live.** Add `state_dir/briefs` and
  `state_dir/reports` (or `tm brief` / `tm report` subcommands) as the single
  documented location, and use it in `delegate-task`, `run-rework`, and
  `independent-review`. *Owner:* `tm.py`, `src/README.md`, `delegate-task`.
  *Gate:* a full run writes briefs and reports with no external-directory
  prompt.
- **A2 — Provision the primary's permissions.** `install.sh` writes a minimal
  `opencode.json` (or documents the equivalent) allowing `~/.teammate/**` and
  each target project's `.agents/**`. *Owner:* `install.sh`, `src/README.md`.
  *Gate:* a fresh primary runs the loop without a permission dialog.
- **A3 — Make the worker boundary explicit.** `worker-role`, `accept-assignment`,
  `delegate-task`, and `templates/worker-brief.md` must forbid paths outside the
  project and require the brief to carry every needed fact inline (no reference
  to the primary's `tm.py`, temp dirs, or `~/.teammate`). *Owner:* those skills.
  *Gate:* a worker completes a rework with no sandbox block.

### P1

- **B1 — Ledger hygiene.** Add `tm task prune` / `archive` and a session marker
  so a new run does not inherit stale tasks; have `recover-run` own
  reconciliation instead of leaving it to improvisation. *Owner:* `tm.py`,
  `task_store.py`, `recover-run`. *Gate:* a fresh run starts with no orphan work
  to do.
- **B2 — Enforce evidence honesty.** `verify-evidence`, `report-result`, and
  `review-change` must require raw, captured output for every pasted command and
  treat an unrun transcript as a finding; reviewers should re-run the decisive
  check. *Owner:* those skills. *Gate:* a fabricated transcript is caught by
  rule, not by chance.
- **B3 — Bootstrap validators.** `bootstrap-project` should install or name the
  stack's HTML/lint/a11y checks so a UI task can run at least one by default,
  even offline. *Owner:* `bootstrap-project`, `templates/project-AGENTS.md`.
  *Gate:* a UI review runs an HTML and an accessibility check.
- **B4 — Document the two skill populations.** State that a project's
  `.agents/skills` holds both Team Mate-managed and Skills-CLI-installed skills,
  how each is tracked, and that syncs never overwrite a skill they do not own.
  *Owner:* `src/README.md`, `bootstrap-project`. *Gate:* no ambiguity on a name
  collision.

### P2

- **C1 — Monitoring ergonomics.** Document (or add a `tm` affordance for)
  running a long `wait` in the background so the primary is not blocked for the
  whole build. *Owner:* `monitor-agents`. *Gate:* the primary can keep working or
  stay responsive while a worker runs.
- **C2 — Session scoping.** Tag tasks with the primary session so the ledger can
  present "this session" separately from history. *Owner:* `task_store.py`.
  *Gate:* `task list` can be filtered to the current session.

## Signals to keep

- Bootstrap before delegate; a prepared project is what turned the result around.
- A visible criterion for UI work, and a reviewer that renders and measures.
- Findings as data: resolve the blocking ones, accept the rest, derive the
  verdict — never let status and verdict disagree.
- Never answer a blocked worker's dialog; cancel and re-brief.
- Commit only on an explicit decision, in atomic conventional commits.
