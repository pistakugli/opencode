import { createMemo, Show } from "solid-js"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useToast } from "../ui/toast"

interface DialogSessionGoalProps {
  session: string
}

export function DialogSessionGoal(props: DialogSessionGoalProps) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const goal = createMemo(() => sync.session.get(props.session)?.goal)
  type GoalUpdate = NonNullable<Parameters<typeof sdk.client.session.update>[0]["goal"]>

  const update = (goal: GoalUpdate, success: string) => {
    void sdk.client.session
      .update({ sessionID: props.session, goal })
      .then(() => toast.show({ message: success, variant: "success" }))
      .catch((error) => {
        toast.show({
          message: error instanceof Error ? error.message : "Failed to update session goal",
          variant: "error",
        })
      })
    dialog.clear()
  }

  const replace = () => {
    void DialogPrompt.show(dialog, "Session goal", {
      value: goal()?.text,
      placeholder: "What should this session achieve?",
    }).then((value) => {
      if (value === null) return dialog.clear()
      if (!value.trim()) {
        toast.show({ message: "Goal text cannot be empty", variant: "warning" })
        return dialog.clear()
      }
      update({ action: "set", text: value }, "Session goal updated")
    })
  }

  return (
    <Show
      when={goal()}
      fallback={
        <DialogPrompt
          title="Set session goal"
          placeholder="What should this session achieve?"
          onConfirm={(value) => {
            if (!value.trim()) {
              toast.show({ message: "Goal text cannot be empty", variant: "warning" })
              return dialog.clear()
            }
            update({ action: "set", text: value }, "Session goal set")
          }}
          onCancel={() => dialog.clear()}
        />
      }
    >
      {(current) => (
        <DialogSelect
          title={`Goal (${current().status})`}
          options={[
            { value: "edit", title: "Edit goal", description: current().text },
            ...(current().status === "active" ? [{ value: "pause", title: "Pause goal" }] : []),
            ...(current().status === "paused" ? [{ value: "resume", title: "Resume goal" }] : []),
            ...(current().status === "completed" ? [] : [{ value: "complete", title: "Mark goal complete" }]),
            { value: "clear", title: "Clear goal" },
          ]}
          onSelect={(option) => {
            if (option.value === "edit") return replace()
            if (option.value === "clear") return update({ action: "clear" }, "Session goal cleared")
            if (option.value === "pause") return update({ action: "pause" }, "Session goal paused")
            if (option.value === "resume") return update({ action: "resume" }, "Session goal resumed")
            update({ action: "complete" }, "Session goal completed")
          }}
        />
      )}
    </Show>
  )
}
