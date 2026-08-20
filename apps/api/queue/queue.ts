import { env } from "@relish/env"
import { db, Task } from "@relish/storage"
import { Queue, QueueEvents, type Job } from "bullmq"
import { TaskParameters } from "~/tasks/types.ts"

export const TASKS_QUEUE_NAME = "tasks"

export const queue = new Queue<TaskParameters>(TASKS_QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
})
export const queueEvents = new QueueEvents(TASKS_QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
})

/**
 * Enqueue a job with a deterministic ID and create the related Task DB record.
 *
 * The job ID identifies the work itself, so  re-enqueuing the same work while the job is still running returns the existing Task instead of creating a duplicate.
 */
export async function enqueueJob(data: TaskParameters & { taskId?: string }): Promise<Task> {
  const jobId = jobIdFor(data)

  // If the same work is already running, just return the corresponding Task
  const existingJob = await queue.getJob(jobId)
  if (existingJob) return await taskForJob(existingJob)

  const task = data.taskId
    ? await db.task.findUnique({ where: { id: data.taskId } })
    : await db.task.create({ data: { type: data.type, status: "PENDING" } })
  if (!task) throw new Error("Task not found.")

  const added = await queue.add(
    data.type,
    { ...data, taskId: task.id },
    {
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )

  // Two concurrent enqueues can both pass the `getJob` check and create a Task before either `queue.add` lands. Only the first job is stored. Re-read the stored job and, if it does not reference the just-created Task, the other enqueue won the race -> Delete this dangling Task and return the winning job's Task instead.
  const persisted = await queue.getJob(added.id ?? jobId)
  if (persisted && persisted.data.taskId !== task.id) {
    await db.task.delete({ where: { id: task.id } })
    return await taskForJob(persisted)
  }

  return task
}

/** Resolve the Task a job references: its own for top-level jobs, its parent's for sub-jobs. */
const taskForJob = async (job: Job<TaskParameters>): Promise<Task> => {
  const taskId = job.data.taskId ?? job.data.parentTaskId
  const task = taskId ? await db.task.findUnique({ where: { id: taskId } }) : null
  if (!task) throw new Error("Task not found.")
  return task
}

/** Enqueue a sub-job without creating a related Task DB record, as the subjob will inherit the parent job's task. */
export async function enqueueSubJob(data: TaskParameters) {
  return await queue.add(data.type, data, {
    jobId: jobIdFor(data),
    removeOnComplete: true,
    removeOnFail: true,
  })
}

/** Derive a deterministic job ID for a task, so that overlapping runs of the same work never process in parallel. */
const jobIdFor = (data: TaskParameters): string => {
  switch (data.type) {
    case "processAllDishes":
      return "processAllDishes"
    case "processDish":
      return `processDish_${data.dishId}`
    case "processDishFromSource":
      return `processDishFromSource_${data.dishId}_${data.adapter}_${data.sourceUrl}`
    default: {
      const _exhaustive: never = data
      throw new Error(`Unexpected task type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
