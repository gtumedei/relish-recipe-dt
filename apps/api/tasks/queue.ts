import { Task } from "@relish/storage"
import { Requires, resolve } from "@relish/utils/di"
import { Queue } from "bullmq"

export const TASKS_QUEUE_NAME = "tasks"

export type TaskData =
  | { type: "processAllDishes" }
  | { type: "processDish"; dishId: string }
  | { type: "processDishFromSource"; dishId: string; adapter: string; sourceUrl: string }

export const queue = new Queue<TaskData>(TASKS_QUEUE_NAME)

/** Enqueue a job and create the related Task DB record. */
export async function enqueueTask(this: Requires<"db">, data: TaskData): Promise<Task> {
  const { db } = resolve(this)
  const task = await db.task.create({ data: { type: data.type, status: "PENDING" } })
  await queue.add(data.type, data, { jobId: task.id })
  return task
}
