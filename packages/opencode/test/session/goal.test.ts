import { describe, expect } from "bun:test"
import { Deferred, Effect, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      SessionNs.node,
      EventV2Bridge.node,
      SessionProjector.node,
      CrossSpawnSpawner.node,
      InstanceStore.node,
    ]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: false })],
      [
        InstanceBootstrap.node,
        Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
      ],
    ],
  ),
)

const withSession = <A, E, R>(self: (sessionID: SessionNs.Info["id"]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const session = yield* SessionNs.Service
    const info = yield* session.create({})
    const result = yield* self(info.id).pipe(Effect.ensuring(session.remove(info.id).pipe(Effect.orDie)))
    return result
  })

describe("session goal", () => {
  it.instance(
    "set, pause, resume, complete and clear a goal",
    withSession((sessionID) =>
      Effect.gen(function* () {
        const session = yield* SessionNs.Service

        yield* session.setGoal({ sessionID, goal: { action: "set", text: "  ship the goal feature  " } })
        const afterSet = yield* session.get(sessionID)
        expect(afterSet.goal?.text).toBe("ship the goal feature")
        expect(afterSet.goal?.status).toBe("active")
        expect(afterSet.goal?.time.created).toBeGreaterThan(0)
        expect(afterSet.goal?.time.paused).toBeUndefined()

        yield* session.setGoal({ sessionID, goal: { action: "pause" } })
        const afterPause = yield* session.get(sessionID)
        expect(afterPause.goal?.status).toBe("paused")
        expect(afterPause.goal?.time.paused).toBeGreaterThan(0)

        yield* session.setGoal({ sessionID, goal: { action: "resume" } })
        const afterResume = yield* session.get(sessionID)
        expect(afterResume.goal?.status).toBe("active")
        expect(afterResume.goal?.time.paused).toBeUndefined()
        expect(afterResume.goal?.text).toBe("ship the goal feature")

        yield* session.setGoal({ sessionID, goal: { action: "complete" } })
        const afterComplete = yield* session.get(sessionID)
        expect(afterComplete.goal?.status).toBe("completed")
        expect(afterComplete.goal?.time.completed).toBeGreaterThan(0)

        yield* session.setGoal({ sessionID, goal: { action: "clear" } })
        const afterClear = yield* session.get(sessionID)
        expect(afterClear.goal).toBeUndefined()
      }),
    ),
  )

  it.instance(
    "replacing a goal keeps the original creation time and restarts it as active",
    withSession((sessionID) =>
      Effect.gen(function* () {
        const session = yield* SessionNs.Service
        yield* session.setGoal({ sessionID, goal: { action: "set", text: "first" } })
        const first = (yield* session.get(sessionID)).goal
        yield* session.setGoal({ sessionID, goal: { action: "pause" } })
        yield* session.setGoal({ sessionID, goal: { action: "set", text: "second" } })
        const second = (yield* session.get(sessionID)).goal
        expect(second?.text).toBe("second")
        expect(second?.status).toBe("active")
        expect(second?.time.created).toBe(first?.time.created)
        expect(second?.time.paused).toBeUndefined()
        expect(second?.time.completed).toBeUndefined()
      }),
    ),
  )

  it.instance(
    "rejects invalid goal transitions",
    withSession((sessionID) =>
      Effect.gen(function* () {
        const session = yield* SessionNs.Service

        const paused = yield* session.setGoal({ sessionID, goal: { action: "pause" } }).pipe(Effect.flip)
        expect(paused._tag).toBe("SessionGoalError")

        const empty = yield* session
          .setGoal({ sessionID, goal: { action: "set", text: "   " } })
          .pipe(Effect.flip)
        expect(empty._tag).toBe("SessionGoalError")
        expect((yield* session.get(sessionID)).goal).toBeUndefined()

        yield* session.setGoal({ sessionID, goal: { action: "set", text: "do it" } })
        yield* session.setGoal({ sessionID, goal: { action: "complete" } })
        const twice = yield* session.setGoal({ sessionID, goal: { action: "complete" } }).pipe(Effect.flip)
        expect(twice._tag).toBe("SessionGoalError")

        const resume = yield* session.setGoal({ sessionID, goal: { action: "resume" } }).pipe(Effect.flip)
        expect(resume._tag).toBe("SessionGoalError")
      }),
    ),
  )

  it.instance(
    "publishes the goal on session.updated",
    withSession((sessionID) =>
      Effect.gen(function* () {
        const session = yield* SessionNs.Service
        const events = yield* EventV2Bridge.Service
        const received = yield* Deferred.make<SessionNs.Info>()

        const unsub = yield* events.listen((event) => {
          if (event.type === SessionNs.Event.Updated.type)
            Deferred.doneUnsafe(
              received,
              Effect.succeed((event.data as typeof SessionNs.Event.Updated.data.Type).info as SessionNs.Info),
            )
          return Effect.void
        })
        yield* Effect.addFinalizer(() => unsub)

        yield* session.setGoal({ sessionID, goal: { action: "set", text: "observed" } })
        const info = yield* Effect.race(
          Deferred.await(received),
          Effect.sleep("2 seconds").pipe(
            Effect.flatMap(() => Effect.fail(new Error("timed out waiting for session.updated"))),
          ),
        )
        expect(info.goal?.text).toBe("observed")
        expect(info.goal?.status).toBe("active")
      }),
    ),
  )
})
