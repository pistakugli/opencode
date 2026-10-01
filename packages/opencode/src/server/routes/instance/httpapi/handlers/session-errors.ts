import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import type { SessionGoal } from "@/session/goal"
import { Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import * as ApiError from "../errors"

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => ApiError.notFound(error.message)))
}

export function mapGoalError<A, R>(self: Effect.Effect<A, SessionGoal.GoalError | StorageNotFoundError, R>) {
  return self.pipe(
    Effect.mapError((error) =>
      error._tag === "SessionGoalError" ? new HttpApiError.BadRequest({}) : ApiError.notFound(error.message),
    ),
  )
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(
    Effect.catchTag("SessionBusyError", (error) =>
      Effect.fail(
        new ApiError.SessionBusyError({
          sessionID: error.sessionID,
          message: `Session is busy: ${error.sessionID}`,
        }),
      ),
    ),
  )
}
