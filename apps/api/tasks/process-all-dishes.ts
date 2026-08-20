import { getLogger } from "@relish/di"
import { sdk } from "@relish/sdk"
import { enqueueSubJob, queueEvents } from "~/queue/queue.ts"
import { RelishWorkerJob } from "~/queue/worker.ts"
import { processDish } from "~/tasks/process-dish.ts"
import { ProcessAllDishesResult, ProcessAllDishesTask } from "~/tasks/types.ts"

/** Fetch all the dishes in the database. Then, for each dish, call `processDish` to find new dish sources. */
export const processAllDishes: ProcessAllDishesTask = async ({ taskId }) => {
  const logger = getLogger()

  const dishes = await sdk.dishes.list({ pagination: false })
  logger.i(`Processing ${dishes.items.length} dishes`)

  const result: ProcessAllDishesResult = {
    success: false,
    dishesProcessed: 0,
    recipesCreated: 0,
    errors: [],
    dishResults: [],
  }

  const childJobs: RelishWorkerJob[] = []

  for (const dish of dishes.items) {
    if (taskId) {
      const childJob = await enqueueSubJob({
        type: "processDish",
        dishId: dish.id,
        parentTaskId: taskId,
      })
      childJobs.push(childJob)
    } else {
      try {
        const dishResult = await processDish({ dishId: dish.id, taskId })
        result.dishesProcessed++
        result.recipesCreated += dishResult.recipesCreated
        result.dishResults.push(dishResult)
        result.errors.push(...dishResult.errors)
      } catch (error) {
        result.errors.push({
          context: `dish:${dish.id}`,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        })
        logger.e(`[${dish.id}] Failed to process dish`, error)
      }
    }
  }

  if (childJobs.length > 0) {
    logger.i(`Waiting for ${childJobs.length} child jobs to complete`)
    const outcomes = await Promise.allSettled(
      childJobs.map((j) => j.waitUntilFinished(queueEvents)),
    )
    const failed = outcomes.filter((o) => o.status === "rejected")
    if (failed.length > 0) {
      for (const f of failed) {
        const reason = (f as PromiseRejectedResult).reason
        result.errors.push({
          context: "childJob",
          message: reason instanceof Error ? reason.message : String(reason),
          cause: reason,
        })
      }
      logger.e(`${failed.length}/${childJobs.length} child jobs failed`)
    }
    logger.i(`All ${childJobs.length} child jobs completed`)
  }

  result.success = result.dishesProcessed > 0
  return result
}
