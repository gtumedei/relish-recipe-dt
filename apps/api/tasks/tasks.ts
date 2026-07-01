import { Dish } from "@relish/storage"
import { Requires, resolve } from "@relish/utils/di"

// /api/tasks/dishes/process
// - Fetch all dishes from the database
// - For each dish, run a search with all available adapters
// - For reach result, run the extraction pipeline with the related adapter
// - Insert new recipe instances (plus related data) in the database
export async function processAllDishes(this: Requires<"sdk" | "logger" | "adapters">) {
  const { sdk, logger } = resolve(this)

  const dishes = await sdk.dishes.list({ pagination: false })
  logger.i(`Processing ${dishes.items.length} dishes`)

  await Promise.all(dishes.items.map((dish) => processDish({ dish })))
}

// /api/tasks/dishes/{dishId}/process Manually extract the recipe of a dish (by dish ID + URL to fetch)
export async function processDish(
  this: Requires<"sdk" | "logger" | "adapters">,
  params: { dish: Dish },
) {
  const { logger, adapters } = resolve(this)
  const { dish } = params

  logger.i(`[${dish.id}] Processing "${dish.name}"`)

  for (const [adapterName, adapter] of Object.entries(adapters)) {
    const sources = await adapter.findDishSources({ dish })
    logger.i(`[${dish.id}] Fetched ${sources.length} sources using the "${adapterName}" adapter`)
    for (const source of sources) {
      await processDishFromSource({ dish, adapter: adapterName, sourceUrl: source.url })
    }
  }
}

// /api/tasks/dishes/{dishId}/process/{sourceUrl}?type={sourceType} Manually extract the recipe of a dish (by dish ID + URL to fetch)
export async function processDishFromSource(
  this: Requires<"sdk" | "logger" | "adapters">,
  params: { dish: Dish; adapter: string; sourceUrl: string },
) {
  const { sdk, logger, adapters } = resolve(this)
  const { dish } = params

  const adapter = adapters[params.adapter as keyof typeof adapters]
  if (!adapter) throw new Error(`Adapter ${params.adapter} not found`)

  logger.i(`[${dish.id}][${params.adapter}] Processing source ${params.sourceUrl}`)

  const extractedRecipes = await adapter.processDishFromSource({
    dish,
    source: { url: params.sourceUrl },
  })

  // TODO: map ingredients and tools to db entities, create them if needed, then insert the new recipe instance
}
