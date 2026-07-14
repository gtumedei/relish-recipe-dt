import { Task } from "@relish/storage"
import { Requires, resolve } from "@relish/utils/di"
import { Queue, QueueEvents } from "bullmq"
import { env } from "@relish/env"

export const TASKS_QUEUE_NAME = "tasks"

type TaskTypeData =
  | { type: "processAllDishes" }
  | { type: "processDish"; dishId: string }
  | { type: "processDishFromSource"; dishId: string; adapter: string; sourceUrl: string }

export type TaskData = { taskId?: string; parentTaskId?: string } & TaskTypeData

export const queue = new Queue<TaskData>(TASKS_QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
})
export const queueEvents = new QueueEvents(TASKS_QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
})

/** Enqueue a job and create the related Task DB record, if no existing task ID is provided. */
export async function enqueueJob(
  this: Requires<"db">,
  data: TaskTypeData & { taskId?: string },
): Promise<Task> {
  const { db } = resolve(this)
  const task = data.taskId
    ? await db.task.findUnique({ where: { id: data.taskId } })
    : await db.task.create({ data: { type: data.type, status: "PENDING" } })
  if (!task) throw new Error("Task not found.")
  await queue.add(data.type, { ...data, taskId: task.id } as TaskData)
  return task
}

/** Enqueue a sub-job without creating a related Task DB record, as the subjob will inherit the parent job's task. */
export async function enqueueSubJob(
  data: TaskTypeData & { taskId?: string; parentTaskId: string },
) {
  return await queue.add(data.type, data as TaskData)
}
