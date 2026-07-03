import { Task } from "@relish/storage"
import { Requires, resolve } from "@relish/utils/di"
import { Queue, QueueEvents } from "bullmq"

export const TASKS_QUEUE_NAME = "tasks"

export type TaskData = { taskId?: string; parentTaskId?: string } & (
  | { type: "processAllDishes" }
  | { type: "processDish"; dishId: string }
  | { type: "processDishFromSource"; dishId: string; adapter: string; sourceUrl: string }
)

export const queue = new Queue<TaskData>(TASKS_QUEUE_NAME)
export const queueEvents = new QueueEvents(TASKS_QUEUE_NAME)

/** Enqueue a job and create the related Task DB record, if no existing task ID is provided. */
export async function enqueueJob(
  this: Requires<"db">,
  data: Omit<TaskData, "taskId" | "parentTaskId"> & { taskId?: string },
): Promise<Task> {
  const { db } = resolve(this)
  const task = data.taskId
    ? await db.task.findUnique({ where: { id: data.taskId } })
    : await db.task.create({ data: { type: data.type, status: "PENDING" } })
  if (!task) throw new Error("Task not found.")
  await queue.add(data.type, { ...data, taskId: task.id } as TaskData)
  return task
}

export async function enqueueSubJob(
  data: Omit<TaskData, "taskId" | "parentTaskId"> & { taskId?: string; parentTaskId: string },
) {
  return await queue.add(data.type, data as TaskData)
}
