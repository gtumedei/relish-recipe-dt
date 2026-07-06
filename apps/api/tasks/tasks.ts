import { env } from "@relish/env"
import { isSemanticMatch } from "@relish/recipe-processing"
import { Prisma } from "@relish/storage"
import { Requires, resolve } from "@relish/utils/di"
import { enqueueSubJob, queueEvents } from "~/tasks/queue.ts"
import { RelishWorkerJob } from "~/tasks/worker.ts"

/** Fetch all the dishes in the database. Then, for each dish, call `processDish` to find new dish sources. */
export async function processAllDishes(
  this: Requires<"sdk" | "logger" | "adapters">,
  { taskId }: { taskId?: string } = {},
) {
  const { sdk, logger } = resolve(this)

  const dishes = await sdk.dishes.list({ pagination: false })
  logger.i(`Processing ${dishes.items.length} dishes`)

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
      await processDish({ dishId: dish.id, taskId })
    }
  }

  if (childJobs.length > 0) {
    logger.i(`Waiting for ${childJobs.length} child jobs to complete`)
    // TODO: handle failed jobs
    await Promise.all(childJobs.map((j) => j.waitUntilFinished(queueEvents)))
    logger.i(`All ${childJobs.length} child jobs completed`)
  }
}

/** Given a dish, loop through all the source adapters and fetch new dish sources with each one. Then, for each source, call `processDishFromSource` to process it. */
export async function processDish(
  this: Requires<"sdk" | "logger" | "adapters">,
  { dishId, taskId }: { dishId: string; taskId?: string },
) {
  const { sdk, logger, adapters } = resolve(this)

  const dish = await sdk.dishes.get({ id: dishId })
  if (!dish) throw new Error(`Dish ${dishId} not found`)

  logger.i(`[${dish.id}] Processing "${dish.name}"`)

  const childJobs: RelishWorkerJob[] = []

  for (const [adapterName, adapter] of Object.entries(adapters)) {
    const sources = await adapter.findDishSources({ dish })
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
        await processDishFromSource({
          dishId: dish.id,
          adapter: adapterName,
          sourceUrl: source.url,
        })
      }
    }
  }

  if (childJobs.length > 0) {
    logger.i(`[${dish.id}] Waiting for ${childJobs.length} child jobs to complete`)
    // TODO: handle failed jobs
    await Promise.all(childJobs.map((j) => j.waitUntilFinished(queueEvents)))
    logger.i(`[${dish.id}] All ${childJobs.length} child jobs completed`)
  }
}

/** Process a dish source to extract recipes and store them in the database. */
export async function processDishFromSource(
  this: Requires<"db" | "sdk" | "logger" | "adapters">,
  params: { dishId: string; adapter: string; sourceUrl: string },
) {
  const { db, sdk, logger, adapters } = resolve(this)

  const dish = await sdk.dishes.get({ id: params.dishId })
  if (!dish) throw new Error(`Dish ${params.dishId} not found`)

  const adapter = adapters[params.adapter as keyof typeof adapters]
  if (!adapter) throw new Error(`Adapter ${params.adapter} not found`)

  logger.i(`[${dish.id}][${params.adapter}] Processing source ${params.sourceUrl}`)

  const extractedRecipes = await adapter.processDishFromSource({
    dish,
    source: { url: params.sourceUrl },
  })

  // Ensure the source URL is tracked in the database
  let processedUrl = await db.processedUrl.findUnique({ where: { url: params.sourceUrl } })
  if (!processedUrl) {
    processedUrl = await db.processedUrl.create({ data: { url: params.sourceUrl } })
  }

  for (const extractedRecipe of extractedRecipes) {
    logger.i(
      `[${dish.id}] Processing recipe: "${extractedRecipe.dish}" (confidence: ${extractedRecipe.modelConfidence})`,
    )

    // Collect all unique ingredient names across all steps
    const allIngredientNames = [
      ...new Set(
        extractedRecipe.steps.flatMap((step) => step.ingredients.map((i) => i.ingredientName)),
      ),
    ]
    // Resolve each ingredient name to a database entity reference
    const ingredientIdMap = new Map<string, string>()
    for (const name of allIngredientNames) {
      ingredientIdMap.set(name, await resolveIngredient(name))
    }

    // Collect all unique tool names (primary + alternatives) across all steps
    const allToolNames = [
      ...new Set(
        extractedRecipe.steps.flatMap((step) =>
          step.tools.flatMap((t) => [t.toolName, ...t.alternativeTools]),
        ),
      ),
    ]
    // Resolve each tool name to a database entity reference
    const toolIdMap = new Map<string, string>()
    for (const name of allToolNames) {
      toolIdMap.set(name, await resolveTool(name))
    }

    // Build steps with resolved database references
    const steps: Prisma.UserStepCreateInput[] = extractedRecipe.steps.map((step) => ({
      description: step.description,
      prepSeconds: step.prepSeconds ?? undefined,
      ingredients: step.ingredients.map((i) => ({
        ingredientOrDishId: ingredientIdMap.get(i.ingredientName)!,
        quantity: i.quantity ?? undefined,
        unit: i.unit ?? undefined,
      })),
      tools: step.tools.map((t) => ({
        tool: toolIdMap.get(t.toolName)!,
        alternatives: t.alternativeTools.map((name) => toolIdMap.get(name)!),
      })),
    }))

    // Aggregate ingredients across all steps (deduplicated by entity ID)
    const ingredientAggregate = new Map<string, { quantity: number | null; unit: string | null }>()
    for (const step of extractedRecipe.steps) {
      for (const i of step.ingredients) {
        const id = ingredientIdMap.get(i.ingredientName)!
        const existing = ingredientAggregate.get(id)
        if (existing) {
          existing.quantity = (existing.quantity ?? 0) + (i.quantity ?? 0)
        } else {
          ingredientAggregate.set(id, {
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
          })
        }
      }
    }

    // Aggregate tools across all steps (deduplicated by entity ID)
    const toolAggregate = new Map<string, Set<string>>()
    for (const step of extractedRecipe.steps) {
      for (const t of step.tools) {
        const id = toolIdMap.get(t.toolName)!
        if (!toolAggregate.has(id)) {
          toolAggregate.set(id, new Set())
        }
        for (const alt of t.alternativeTools) {
          toolAggregate.get(id)!.add(toolIdMap.get(alt)!)
        }
      }
    }

    const totalPrepSeconds = extractedRecipe.steps.reduce(
      (sum, step) => sum + (step.prepSeconds ?? 0),
      0,
    )

    // Create the recipe instance in the database
    const recipeInstance = await sdk.recipeInstances.create({
      data: {
        dishId: dish.id,
        sourceId: processedUrl.id,
        index: extractedRecipe.index,
        modelConfidence: extractedRecipe.modelConfidence,
        totalPrepSeconds: totalPrepSeconds || undefined,
        language: extractedRecipe.language,
        location: extractedRecipe.location
          ? {
              string: extractedRecipe.location,
              geonameId: await resolveGeonameId(extractedRecipe.location),
            }
          : null,
        media: [], // TODO: populate media
        ingredients: [...ingredientAggregate.entries()].map(([id, { quantity, unit }]) => ({
          ingredientOrDishId: id,
          quantity,
          unit,
        })),
        tools: [...toolAggregate.entries()].map(([id, alternatives]) => ({
          tool: id,
          alternatives: [...alternatives],
        })),
        steps,
      },
    })

    logger.i(`[${dish.id}] Created recipe instance ${recipeInstance.id}`)
  }
}

/**
 * Resolve an ingredient name to a database entity reference.
 * Searches for existing ingredients, checks for semantic matches, and creates new entities when no match is found.
 */
async function resolveIngredient(this: Requires<"sdk" | "logger">, name: string): Promise<string> {
  const { sdk, logger } = resolve(this)

  const results = await sdk.ingredients.search({ query: name, limit: 3 })

  for (const result of results) {
    const candidates = [result.ingredient.name, ...result.ingredient.nameAliases]
    const match = await isSemanticMatch("ingredient", name, candidates)

    if (typeof match === "string") {
      // Heuristic matched: the ingredient is already known under that name
      logger.i(`Ingredient "${name}" matched existing "${result.ingredient.name}" (heuristic)`)
      return result.ingredient.id
    }

    if (match === true) {
      // LLM matched: add the extracted name as an alias if it's not already known
      if (!candidates.includes(name)) {
        await sdk.ingredients.update({
          id: result.ingredient.id,
          data: { nameAliases: { push: name } },
        })
      }
      logger.i(`Ingredient "${name}" matched existing "${result.ingredient.name}" (LLM)`)
      return result.ingredient.id
    }
  }

  // No match found: create a new ingredient
  const created = await sdk.ingredients.create({ data: { name } })
  logger.i(`Created new ingredient "${name}" (${created.id})`)
  return created.id
}

/**
 * Resolve a tool name to a database entity reference.
 * Searches for existing tools, checks for semantic matches, and creates new entities when no match is found.
 */
async function resolveTool(this: Requires<"sdk" | "logger">, name: string): Promise<string> {
  const { sdk, logger } = resolve(this)

  const results = await sdk.tools.search({ query: name, limit: 3 })

  for (const result of results) {
    const candidates = [result.tool.name, ...result.tool.nameAliases]
    const match = await isSemanticMatch("tool", name, candidates)

    if (typeof match === "string") {
      // Heuristic matched: the tool is already known under that name
      logger.i(`Tool "${name}" matched existing "${result.tool.name}" (heuristic)`)
      return result.tool.id
    }

    if (match === true) {
      // LLM matched: add the extracted name as an alias if it's not already known
      if (!candidates.includes(name)) {
        await sdk.tools.update({
          id: result.tool.id,
          data: { nameAliases: { push: name } },
        })
      }
      logger.i(`Tool "${name}" matched existing "${result.tool.name}" (LLM)`)
      return result.tool.id
    }
  }

  // No match found: create a new tool
  const created = await sdk.tools.create({ data: { name } })
  logger.i(`Created new tool "${name}" (${created.id})`)
  return created.id
}

/**
 * Look up a GeoNames ID for a location string using the GeoNames search API.
 * Returns the geonameId string if found, or null if the query is empty or no results are returned.
 */
async function resolveGeonameId(location: string | undefined): Promise<string | null> {
  if (!location?.trim()) return null

  const params = new URLSearchParams({
    q: location.trim(),
    username: env.GEONAMES_USERNAME,
    maxRows: "1",
  })

  const res = await fetch(`https://api.geonames.org/searchJSON?${params}`)
  if (!res.ok) return null

  const data = (await res.json()) as { geonames?: Array<{ geonameId: string }> }
  return data.geonames?.[0]?.geonameId ?? null
}
