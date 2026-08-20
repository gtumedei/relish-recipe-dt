import { getLogger } from "@relish/di"
import { sdk } from "@relish/sdk"
import { runTask } from "~/tasks/run-task.ts"
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

  const subTasksResults = await Promise.allSettled(
    dishes.items.map((dish) => runTask({ type: "processDish", dishId: dish.id, taskId })),
  )

  for (const [index, subTaskResult] of subTasksResults.entries()) {
    const dish = dishes.items[index]
    if (subTaskResult.status === "fulfilled") {
      result.dishesProcessed++
      result.recipesCreated += subTaskResult.value.recipesCreated
      result.dishResults.push(subTaskResult.value)
      result.errors.push(...subTaskResult.value.errors)
    } else {
      const { reason } = subTaskResult
      result.errors.push({
        context: `dish:${dish.id}`,
        message: reason instanceof Error ? reason.message : String(reason),
        cause: reason,
      })
      logger.e(`[${dish.id}] Failed to process dish`, reason)
    }
  }

  result.success = result.dishesProcessed > 0
  return result
}
