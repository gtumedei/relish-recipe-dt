import { withContainer } from "@relish/utils/di"
import { Worker, type Job } from "bullmq"
import { container } from "~/api.container.ts"
import { TaskData, TASKS_QUEUE_NAME } from "~/tasks/queue.ts"
import { processAllDishes, processDish, processDishFromSource } from "~/tasks/tasks.ts"
import { createWorkerContainer } from "~/tasks/worker.container.ts"

const { db } = container

export type RelishWorkerJob = Job<TaskData>

const worker = new Worker(
  TASKS_QUEUE_NAME,
  async (task: Job<TaskData>) => {
    if (!task.id) throw new Error("Task has no identifier")

    // Sub-jobs log to the parent's Task record; top-level jobs log to their own
    const loggerTaskId = task.data.parentTaskId ?? task.data.taskId
    if (!loggerTaskId) throw new Error("Job has no taskId or parentTaskId")

    const container = createWorkerContainer({ taskId: loggerTaskId })
    const { logger } = container
    logger.i(`Task started: ${task.data.type}`)

    await withContainer(container, async () => {
      switch (task.data.type) {
        case "processAllDishes":
          await processAllDishes({ taskId: task.data.taskId! })
          break
        case "processDish":
          await processDish({
            dishId: task.data.dishId,
            taskId: task.data.parentTaskId ?? task.data.taskId!,
          })
          break
        case "processDishFromSource":
          await processDishFromSource({
            dishId: task.data.dishId,
            adapter: task.data.adapter,
            sourceUrl: task.data.sourceUrl,
          })
          break
        default: {
          const _exhaustive: never = task.data
          throw new Error(`Unknown task type: ${JSON.stringify(_exhaustive)}`)
        }
      }
    })

    // TODO: fetch a summary of the errors and warning and return them. Fail the task if there are any errors
    logger.i("Task completed")
    return { ok: true }
  },
  { connection: { host: "localhost", port: 6379 }, concurrency: 10 },
)

// Sync task status on the database (only for top-level jobs that have their own Task record)

worker.on("active", async (task) => {
  console.log(`[task:${task.id}] processing`)
  if (!task.data.taskId) return // Sub-jobs have no own Task record
  await db.task.update({
    data: { status: "RUNNING" },
    where: { id: task.data.taskId },
  })
})

worker.on("completed", async (task: Job) => {
  console.log(`[task:${task.id}] completed`)
  if (!task.data.taskId) return // Sub-jobs have no own Task record
  await db.task.update({
    data: { status: "COMPLETED", completedAt: new Date() },
    where: { id: task.data.taskId },
  })
})

worker.on("failed", async (task: Job | undefined, err: Error) => {
  console.error(`[task:${task?.id}] failed:`, err)
  if (task?.data.taskId) {
    await db.task.update({
      data: { status: "FAILED", completedAt: new Date() },
      where: { id: task.data.taskId },
    })
  }
})

worker.on("stalled", (taskId) => {
  console.error(`[task:${taskId}] stalled`)
  // Stalled events only have the BullMQ job ID; we cannot look up the DB task ID here
  // without additional context, so this handler remains best-effort.
})

console.log(`🤖 Worker listening on queue: "${TASKS_QUEUE_NAME}"`)
