import { ThreadWorker } from "@poolifier/poolifier-web-worker"
import { createWorkerContainer } from "./worker.container.ts"

const workerFn = async (data?: { taskId: string }) => {
  if (!data) throw new Error("Missing task data")
  const { logger, db } = await createWorkerContainer(data)

  logger.i("Task started")
  logger.i("Test payload", data)
  // console.log("Test payload", data)
  await new Promise((r) => setTimeout(r, 5000))
  logger.w("Middle of the task")
  // console.log("Middle of the task")
  await new Promise((r) => setTimeout(r, 20000))
  const res = { ok: 1, data }
  logger.i("Task completed", res)
  // console.log("Task completed", res)
  await db.task.update({
    where: { id: data.taskId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  })
  return res
}

export type WorkerData = Parameters<typeof workerFn>[number]
export type WorkerResponse = ReturnType<typeof workerFn>

export default new ThreadWorker(workerFn, {
  maxInactiveTime: 60000,
})
