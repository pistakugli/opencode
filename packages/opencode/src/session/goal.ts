import { Schema } from "effect"
import { Session } from "@opencode-ai/schema/session"

export const Update = Schema.Struct({
  action: Schema.Literals(["set", "pause", "resume", "complete", "clear"]),
  text: Schema.optional(Schema.String),
}).annotate({ identifier: "Session.Goal.Update" })
export type Update = typeof Update.Type

export class GoalError extends Schema.TaggedErrorClass<GoalError>()("SessionGoalError", {
  reason: Schema.String,
}) {}

export type Result =
  | { ok: true; goal: Session.Goal | undefined }
  | { ok: false; reason: string }

const MAX_TEXT = 4000

export function apply(current: Session.Goal | undefined, update: Update, now: number): Result {
  if (update.action === "clear") return { ok: true, goal: undefined }
  if (update.action === "set") return set(current, update, now)
  if (!current) return { ok: false, reason: `no goal to ${update.action}` }
  if (update.action === "pause") return pause(current, now)
  if (update.action === "resume") return resume(current, now)
  return complete(current, now)
}

function set(current: Session.Goal | undefined, update: Update, now: number): Result {
  const text = update.text?.trim()
  if (!text) return { ok: false, reason: "goal text is required" }
  if (text.length > MAX_TEXT) return { ok: false, reason: `goal text exceeds ${MAX_TEXT} characters` }
  return {
    ok: true,
    goal: { text, status: "active", time: { created: current?.time.created ?? now, updated: now } },
  }
}

function pause(current: Session.Goal, now: number): Result {
  if (current.status !== "active") return { ok: false, reason: "only an active goal can be paused" }
  return {
    ok: true,
    goal: { ...current, status: "paused", time: { ...current.time, paused: now, updated: now } },
  }
}

function resume(current: Session.Goal, now: number): Result {
  if (current.status !== "paused") return { ok: false, reason: "only a paused goal can be resumed" }
  const time = { ...current.time, updated: now }
  delete time.paused
  return { ok: true, goal: { ...current, status: "active", time } }
}

function complete(current: Session.Goal, now: number): Result {
  if (current.status === "completed") return { ok: false, reason: "goal is already completed" }
  return {
    ok: true,
    goal: { ...current, status: "completed", time: { ...current.time, completed: now, updated: now } },
  }
}

export function render(goal: Session.Goal): string {
  const status =
    goal.status === "paused"
      ? "paused — do not actively work toward it unless the user asks"
      : goal.status === "completed"
        ? "completed"
        : "active"
  return [
    "The session goal tracks what this conversation is trying to achieve:",
    "<session_goal>",
    `  status: ${status}`,
    `  goal: ${goal.text}`,
    "</session_goal>",
  ].join("\n")
}

export * as SessionGoal from "./goal"
