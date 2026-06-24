import { Worker, type Job } from "bullmq"
import { TaskData, TASKS_QUEUE_NAME } from "~/tasks/queue.ts"
import { createWorkerContainer } from "~/tasks/worker.container.ts"
import { container } from "~/api.container.ts"

const worker = new Worker(
  TASKS_QUEUE_NAME,
  async (task: Job<TaskData>) => {
    if (!task.id) throw new Error("Task has no identifier")

    const { logger } = createWorkerContainer({ taskId: task.id })

    logger.i("Task started")
    logger.i("Test payload", task.data)
    // console.log("Test payload", data)
    await new Promise((r) => setTimeout(r, 5000))

    logger.w("Middle of the task")
    // console.log("Middle of the task")
    await new Promise((r) => setTimeout(r, 20000))
    const res = { ok: 1, data: task.data }

    logger.i("Task completed", res)
    return res
  },
  { connection: { host: "localhost", port: 6379 }, concurrency: 2 },
)

// Sync task status on the database

worker.on("active", async (task) => {
  console.log(`[task:${task.id}] processing`)
  await container.db.task.update({
    data: { status: "RUNNING" },
    where: { id: task.id },
  })
})

worker.on("completed", async (task: Job) => {
  console.log(`[task:${task.id}] completed`)
  await container.db.task.update({
    data: { status: "COMPLETED", completedAt: new Date() },
    where: { id: task.id },
  })
})

worker.on("failed", async (task: Job | undefined, err: Error) => {
  console.error(`[task:${task?.id}] failed - `, err.message)
  if (task) {
    await container.db.task.update({
      data: { status: "FAILED", completedAt: new Date() },
      where: { id: task?.id },
    })
  }
})

worker.on("stalled", async (taskId) => {
  console.error(`[task:${taskId}] stalled`)
  await container.db.task.update({
    data: { status: "STALLED", stallCount: { increment: 1 } },
    where: { id: taskId },
  })
})

console.log(`🤖 Worker listening on queue: "${TASKS_QUEUE_NAME}"`)
