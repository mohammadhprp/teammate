import type { Plugin } from "@opencode/plugin/effect"

export type Ctx = Plugin.Context
export type SessionID = Parameters<Ctx["session"]["get"]>[0]["sessionID"]

export type TaskStatus =
  | "delegated"
  | "working"
  | "awaiting_review"
  | "reviewing"
  | "rework"
  | "ready_for_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "cancelled"
  | "paused"

export type FindingSeverity = "blocker" | "major" | "minor" | "nit"

export interface Finding {
  severity: FindingSeverity
  category: string
  title: string
  detail: string
  file?: string
  line?: number
  suggestion?: string
}

export interface Task {
  id: string
  title: string
  goal: string
  context?: string
  acceptanceCriteria: readonly string[]
  constraints?: readonly string[]
  status: TaskStatus
  originSessionID: string
  directory: string
  workerSessionID: string
  workerAgent: string
  iteration: number
  maxIterations: number
  lastVerdict?: "pass" | "fail" | "inconclusive"
  report?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface Review {
  taskID: string
  iteration: number
  verdict: "pass" | "fail" | "inconclusive"
  summary: string
  findings: readonly Finding[]
  at: number
}

export interface Decision {
  taskID: string
  kind: "approve" | "request-changes" | "reject" | "finalize"
  note?: string
  at: number
}

export const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "delegated",
  "working",
  "awaiting_review",
  "reviewing",
  "rework",
])

export const isBlocking = (finding: Finding): boolean =>
  finding.severity === "blocker" || finding.severity === "major"

export const newId = (): string => `tsk_${crypto.randomUUID()}`
