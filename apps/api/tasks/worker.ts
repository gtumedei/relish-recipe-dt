import { withContainer } from "@relish/utils/di"
import { Worker, type Job } from "bullmq"
import { container } from "~/api.container.ts"
import { TaskData, TASKS_QUEUE_NAME } from "~/tasks/queue.ts"
import { processAllDishes, processDish, processDishFromSource } from "~/tasks/tasks.ts"
import { createWorkerContainer } from "~/tasks/worker.container.ts"

const { db } = container

const worker = new Worker(
  TASKS_QUEUE_NAME,
  async (task: Job<TaskData>) => {
    if (!task.id) throw new Error("Task has no identifier")

    const container = createWorkerContainer({ taskId: task.id })
    const { logger } = container
    logger.i(`Task started: ${task.data.type}`)

    await withContainer(container, async () => {
      switch (task.data.type) {
        case "processAllDishes":
          await processAllDishes({ enqueue: true })
          break
        case "processDish":
          await processDish({ dishId: task.data.dishId, enqueue: true })
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

    logger.i("Task completed")
    return { ok: true }
  },
  { connection: { host: "localhost", port: 6379 }, concurrency: 10 },
)

// Sync task status on the database (skip for sub-jobs without Task records)

worker.on("active", async (task) => {
  console.log(`[task:${task.id}] processing`)
  try {
    await db.task.update({
      data: { status: "RUNNING" },
      where: { id: task.id },
    })
  } catch {
    // Sub-jobs have no Task record — ignore
  }
})

worker.on("completed", async (task: Job) => {
  console.log(`[task:${task.id}] completed`)
  try {
    await db.task.update({
      data: { status: "COMPLETED", completedAt: new Date() },
      where: { id: task.id },
    })
  } catch {
    // Sub-jobs have no Task record — ignore
  }
})

worker.on("failed", async (task: Job | undefined, err: Error) => {
  console.error(`[task:${task?.id}] failed - `, err.message)
  if (task) {
    try {
      await db.task.update({
        data: { status: "FAILED", completedAt: new Date() },
        where: { id: task?.id },
      })
    } catch {
      // Sub-jobs have no Task record — ignore
    }
  }
})

worker.on("stalled", async (taskId) => {
  console.error(`[task:${taskId}] stalled`)
  try {
    await db.task.update({
      data: { status: "STALLED", stallCount: { increment: 1 } },
      where: { id: taskId },
    })
  } catch {
    // Sub-jobs have no Task record — ignore
  }
})

console.log(`🤖 Worker listening on queue: "${TASKS_QUEUE_NAME}"`)
