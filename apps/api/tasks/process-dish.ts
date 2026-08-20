import { getAdapters, getLogger } from "@relish/di"
import { sdk } from "@relish/sdk"
import { enqueueSubJob, queueEvents } from "~/queue/queue.ts"
import { RelishWorkerJob } from "~/queue/worker.ts"
import { processDishFromSource } from "~/tasks/process-dish-from-source.ts"
import { ProcessDishResult, ProcessDishTask } from "~/tasks/types.ts"

/** Given a dish, loop through all the source adapters and fetch new dish sources with each one. Then, for each source, call `processDishFromSource` to process it. */
export const processDish: ProcessDishTask = async ({ dishId, taskId }) => {
  const logger = getLogger()
  const adapters = getAdapters()

  const dish = await sdk.dishes.get({ id: dishId })
  if (!dish) throw new Error(`Dish ${dishId} not found`)

  logger.i(`[${dish.id}] Processing "${dish.name}"`)

  const dishResult: ProcessDishResult = {
    dishId: dish.id,
    dishName: dish.name,
    success: false,
    sourcesProcessed: 0,
    recipesCreated: 0,
    errors: [],
  }

  const childJobs: RelishWorkerJob[] = []

  for (const [adapterName, adapter] of Object.entries(adapters)) {
    let sources
    try {
      sources = await adapter.findDishSources({ dish })
    } catch (error) {
      dishResult.errors.push({
        context: `dish:${dish.id}/adapter:${adapterName}/findSources`,
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      })
      logger.e(`[${dish.id}] Failed to find sources using the "${adapterName}" adapter`, error)
      continue
    }

    logger.i(`[${dish.id}] Fetched ${sources.length} sources using the "${adapterName}" adapter`)
    for (const source of sources) {
      if (taskId) {
        const childJob = await enqueueSubJob({
          type: "processDishFromSource",
          dishId: dish.id,
          adapter: adapterName,
          sourceUrl: source.url,
          parentTaskId: taskId,
        })
        childJobs.push(childJob)
      } else {
        try {
          const sourceResult = await processDishFromSource({
            dishId: dish.id,
            adapter: adapterName,
            sourceUrl: source.url,
          })
          dishResult.sourcesProcessed++
          dishResult.recipesCreated += sourceResult.recipesCreated
          dishResult.errors.push(...sourceResult.errors)
        } catch (error) {
          dishResult.errors.push({
            context: `dish:${dish.id}/source:${source.url}`,
            message: error instanceof Error ? error.message : String(error),
            cause: error,
          })
          logger.e(`[${dish.id}] Failed to process source ${source.url}`, error)
        }
      }
    }
  }

  if (childJobs.length > 0) {
    logger.i(`[${dish.id}] Waiting for ${childJobs.length} child jobs to complete`)
    const outcomes = await Promise.allSettled(
      childJobs.map((j) => j.waitUntilFinished(queueEvents)),
    )
    const failed = outcomes.filter((o) => o.status === "rejected")
    if (failed.length > 0) {
      for (const f of failed) {
        const reason = (f as PromiseRejectedResult).reason
        dishResult.errors.push({
          context: `dish:${dish.id}/childJob`,
          message: reason instanceof Error ? reason.message : String(reason),
          cause: reason,
        })
      }
      logger.e(`[${dish.id}] ${failed.length}/${childJobs.length} child jobs failed`)
    }
    logger.i(`[${dish.id}] All ${childJobs.length} child jobs completed`)
  }

  dishResult.success = dishResult.sourcesProcessed > 0
  return dishResult
}
