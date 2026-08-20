import { enqueueSubJob, queueEvents } from "~/queue/queue.ts"
import { processAllDishes } from "~/tasks/process-all-dishes.ts"
import { processDish } from "~/tasks/process-dish.ts"
import { processDishFromSource } from "~/tasks/process-dish-from-source.ts"
import { TaskParameters, TaskResultMap } from "~/tasks/types.ts"

/**
 * Run a task to completion, resolving with its full result.
 *
 * - If `params.taskId` is set, the task is enqueued as a sub-job under that parent task and the function waits for it to finish, resolving with the worker's returned result.
 * - Otherwise the task function runs directly in-process.
 */
export const runTask = async <TTaskParameters extends TaskParameters>(
  params: TTaskParameters,
): Promise<TaskResultMap[TTaskParameters["type"]]> => {
  const { taskId } = params
  // taskId specified: enqueued as sub-job
  if (taskId) {
    const job = await enqueueSubJob({ ...params, parentTaskId: taskId })
    const result = await job.waitUntilFinished(queueEvents)
    return result as TaskResultMap[TTaskParameters["type"]]
  }

  // Direct path: call the task function directly
  switch (params.type) {
    case "processAllDishes":
      return (await processAllDishes(params)) as TaskResultMap[TTaskParameters["type"]]
    case "processDish":
      return (await processDish(params)) as TaskResultMap[TTaskParameters["type"]]
    case "processDishFromSource":
      return (await processDishFromSource(params)) as TaskResultMap[TTaskParameters["type"]]
    default: {
      const _exhaustive: never = params
      throw new Error(`Unknown task type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
