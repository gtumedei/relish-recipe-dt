import { withDependencies, withSelectedDependencies } from "@relish/di"
import { env } from "@relish/env"
import { createAdapters } from "@relish/source-adapters"
import { db } from "@relish/storage"
import { Worker, type Job } from "bullmq"
import { createPersistedTaskLogger } from "~/lib/task-logger.ts"
import { TASKS_QUEUE_NAME } from "~/queue/queue.ts"
import { processAllDishes } from "~/tasks/process-all-dishes.ts"
import { processDishFromSource } from "~/tasks/process-dish-from-source.ts"
import { processDish } from "~/tasks/process-dish.ts"
import { TaskParameters } from "~/tasks/types.ts"

export type RelishWorkerJob = Job<TaskParameters>

const worker = new Worker(
  TASKS_QUEUE_NAME,
  async (task: RelishWorkerJob) => {
    if (!task.id) throw new Error("Task has no identifier")

    // Sub-jobs log to the parent's Task record; top-level jobs log to their own
    const loggerTaskId = task.data.parentTaskId ?? task.data.taskId
    if (!loggerTaskId) throw new Error("Job has no taskId or parentTaskId")

    const logger = createPersistedTaskLogger({
      taskId: loggerTaskId,
      jobId: task.id,
      prefix: `[job:${task.id}]`,
    })
    logger.i(`Task started: ${task.data.type}`)

    const adapters = withSelectedDependencies({ logger }, createAdapters)

    const result = await withDependencies({ logger, adapters }, async () => {
      switch (task.data.type) {
        case "processAllDishes":
          return await processAllDishes({ taskId: task.data.taskId! })
        case "processDish":
          return await processDish({
            dishId: task.data.dishId,
            taskId: task.data.parentTaskId ?? task.data.taskId!,
          })
        case "processDishFromSource":
          return await processDishFromSource({
            dishId: task.data.dishId,
            adapter: task.data.adapter,
            sourceUrl: task.data.sourceUrl,
          })
        default: {
          const _exhaustive: never = task.data
          throw new Error(`Unknown task type: ${JSON.stringify(_exhaustive)}`)
        }
      }
    })

    // Apply the appropriate final status based on the presence of errors
    if (result.errors.length > 0) {
      logger.e(`Task completed with ${result.errors.length} errors`)
      if (task.data.taskId) {
        await db.task.update({
          data: { status: "COMPLETED_WITH_ERRORS", completedAt: new Date() },
          where: { id: task.data.taskId },
        })
      }
    } else {
      logger.i("Task completed")
      if (task.data.taskId) {
        await db.task.update({
          data: { status: "COMPLETED", completedAt: new Date() },
          where: { id: task.data.taskId },
        })
      }
    }

    // Ensure all log writes are persisted before the job is considered done
    await logger.flush?.()
    return { ok: result.errors.length === 0 }
  },
  { connection: { url: env.REDIS_URL }, concurrency: 10 },
)

// Sync task status on the database

worker.on("active", async (task) => {
  const taskId = task.data.taskId ?? task.data.parentTaskId
  if (!taskId || !task.id) {
    console.log(`[unknown task - no database match][task:${taskId ?? task.id}] started.`)
    return
  }

  const logger = createPersistedTaskLogger({ taskId })
  logger.i("Task started")
  if (task.data.taskId) {
    await db.task.update({
      data: { status: "RUNNING" },
      where: { id: taskId },
    })
  }
})

worker.on("completed", (task: Job) => {
  const taskId = task.data.taskId ?? task.data.parentTaskId
  if (!taskId || !task.id) {
    console.log(`[unknown task - no database match][task:${taskId ?? task.id}] completed.`)
    return
  }

  const logger = createPersistedTaskLogger({ taskId })
  logger.s("Task completed")
  // No need to set the status here -> Already handled by the worker
})

worker.on("failed", async (task: Job | undefined, err: Error) => {
  const taskId = task?.data.taskId ?? task?.data.parentTaskId
  if (!taskId || !task?.id) {
    console.log(`[unknown task - no database match][task:${taskId ?? task?.id}] failed.`)
    return
  }

  const logger = createPersistedTaskLogger({ taskId })
  logger.e("Task failed", err)
  if (task?.data.taskId) {
    await db.task.update({
      data: { status: "FAILED", completedAt: new Date() },
      where: { id: taskId },
    })
  }
})

console.log(`🤖 Worker listening on queue: "${TASKS_QUEUE_NAME}"`)
