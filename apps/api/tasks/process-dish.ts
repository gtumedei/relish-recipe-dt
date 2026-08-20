import { getAdapters, getLogger } from "@relish/di"
import { sdk } from "@relish/sdk"
import { runTask } from "~/tasks/run-task.ts"
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

    const subTasksResults = await Promise.allSettled(
      sources.map((source) =>
        runTask({
          type: "processDishFromSource",
          dishId: dish.id,
          adapter: adapterName,
          sourceUrl: source.url,
          taskId,
        }),
      ),
    )

    for (const [index, subTaskResult] of subTasksResults.entries()) {
      if (subTaskResult.status === "fulfilled") {
        dishResult.sourcesProcessed++
        dishResult.recipesCreated += subTaskResult.value.recipesCreated
        dishResult.errors.push(...subTaskResult.value.errors)
      } else {
        const { reason } = subTaskResult
        const sourceUrl = sources[index].url
        dishResult.errors.push({
          context: `dish:${dish.id}/source:${sourceUrl}`,
          message: reason instanceof Error ? reason.message : String(reason),
          cause: reason,
        })
        logger.e(`[${dish.id}] Failed to process source ${sourceUrl}`, reason)
      }
    }
  }

  dishResult.success = dishResult.sourcesProcessed > 0
  return dishResult
}
