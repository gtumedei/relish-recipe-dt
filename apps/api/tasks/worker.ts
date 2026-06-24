import { Worker, type Job } from "bullmq"
import { TaskData, TASKS_QUEUE_NAME } from "~/tasks/queue.ts"
import { createWorkerContainer } from "~/tasks/worker.container.ts"

const worker = new Worker(
  TASKS_QUEUE_NAME,
  async (task: Job<TaskData>) => {
    console.log(`[job:${task.id}] processing (name: ${task.name})`, task.data)
    if (!task.id) throw new Error("Job has no identifier")

    const { logger, db } = createWorkerContainer({ taskId: task.id })

    logger.i("Task started")
    logger.i("Test payload", task.data)
    // console.log("Test payload", data)
    await new Promise((r) => setTimeout(r, 5000))

    logger.w("Middle of the task")
    // console.log("Middle of the task")
    // await new Promise((r) => setTimeout(r, 20000))
    const res = { ok: 1, data: task.data }

    logger.i("Task completed", res)
    // console.log("Task completed", res)
    await db.task.update({
      where: { id: task.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    })

    console.log(`[job:${task.id}] done`, res)
    return res
  },
  { connection: { host: "localhost", port: 6379 }, concurrency: 2 },
)

worker.on("completed", (job: Job) => console.log(`[job:${job.id}] completed`))
worker.on("failed", (job: Job | undefined, err: Error) =>
  console.error(`[job:${job?.id}] failed - `, err.message),
)

console.log(`🤖 Worker listening on queue: "jobs"`)
