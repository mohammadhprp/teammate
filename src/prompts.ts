import type { Finding, Review, Task } from "./domain"

export const buildWorkerBrief = (task: Task): string => {
  const criteria = task.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")
  const constraints = task.constraints?.length
    ? task.constraints.map((c) => `  - ${c}`).join("\n")
    : "  None."
  return `You are the working agent for Team Mate task ${task.id}.

## Goal
${task.goal}

## Context
${task.context ?? "None provided."}

## Acceptance criteria
${criteria}

## Constraints
${constraints}

## Working rules
1. Inspect the repository before changing anything.
2. Implement the smallest change that satisfies the goal.
3. Validate with the project's tests or an equivalent check.
4. Do not commit, push, or open a pull request.
5. When you finish, end with a report in this exact shape:

   STATUS: succeeded | failed | blocked
   SUMMARY: <one paragraph>
   CHANGES: <files and what changed>
   VALIDATION: <commands run and results>
   CONCERNS: <anything the reviewer should check>`
}

export const buildReviewRequest = (task: Task, report: string): string => {
  const criteria = task.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")
  return `Team Mate review required.

Task: ${task.title}
Task ID: ${task.id}
Iteration: ${task.iteration} of ${task.maxIterations}
Goal: ${task.goal}
Acceptance criteria:
${criteria}

Worker report:
${report || "(no report captured)"}

Inspect the repository directly. Run the relevant checks. Then call
team_mate_submit_review with a verdict and findings. Do not pass the work
unless every acceptance criterion holds and no blocker or major findings
remain.`
}

export const buildFeedback = (task: Task, review: Review): string => {
  const open = review.findings
  const lines = open
    .map((f) => {
      const where = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""
      return `  - [${f.severity}] ${f.title}${where}: ${f.detail}${f.suggestion ? ` Suggestion: ${f.suggestion}` : ""}`
    })
    .join("\n")
  return `Review findings for Team Mate task ${task.id}, iteration ${review.iteration}.

${lines}

Address each finding. Do not expand scope. When finished, end with the same
structured report as before.`
}

export const buildApprovalRequest = (task: Task, review: Review | undefined): string => {
  const concerns = review?.findings.length
    ? review.findings.map((f) => `  - [${f.severity}] ${f.title}`).join("\n")
    : "  None."
  return `Team Mate task ${task.id} is ready for developer approval.

Task: ${task.title}
Goal: ${task.goal}
Iterations: ${task.iteration} of ${task.maxIterations}
Last verdict: ${task.lastVerdict ?? "pass"}

Remaining concerns:
${concerns}

Present a concise report to the developer: what was requested, what changed,
what you reviewed, what was found and fixed, remaining concerns, and your
assessment. Then ask them to approve, request changes, reject, or finalize, and
record the decision with team_mate_decide.`
}

export const formatFindings = (findings: readonly Finding[]): string =>
  findings.length
    ? findings.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join("\n")
    : "None."

export const formatReport = (task: Task, reviews: Review[]): string => {
  const lines: string[] = [
    `## Team Mate report: ${task.title}`,
    "",
    `Task: ${task.id}`,
    `Status: ${task.status}`,
    `Iterations: ${task.iteration} of ${task.maxIterations}`,
    "",
    "### Requested",
    task.goal,
    "",
    "### Acceptance criteria",
    ...task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
    "",
    "### Worker report",
    task.report ?? "(none)",
    "",
    "### Reviews",
  ]
  for (const r of reviews) {
    lines.push(`- iteration ${r.iteration}: ${r.verdict} - ${r.summary}`)
    if (r.findings.length) lines.push(formatFindings(r.findings))
  }
  return lines.join("\n")
}
