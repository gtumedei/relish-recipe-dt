import { getAdapters, getLogger } from "@relish/di"
import { env } from "@relish/env"
import { checkRecipeMatch, isSemanticMatch } from "@relish/recipe-processing"
import { sdk } from "@relish/sdk"
import { db, Prisma } from "@relish/storage"
import { tryCatch } from "@relish/utils/try"
import { enqueueSubJob, queueEvents } from "~/tasks/queue.ts"
import { RelishWorkerJob } from "~/tasks/worker.ts"

export type ProcessingResult = {
  success: boolean
  dishesProcessed: number
  recipesCreated: number
  errors: ProcessingError[]
  dishResults: DishResult[]
}

type DishResult = {
  dishId: string
  dishName: string
  success: boolean
  sourcesProcessed: number
  recipesCreated: number
  errors: ProcessingError[]
}

type SourceResult = {
  recipesCreated: number
  errors: ProcessingError[]
}

type ProcessingError = {
  context: string
  message: string
  cause?: unknown
}

/** Fetch all the dishes in the database. Then, for each dish, call `processDish` to find new dish sources. */
export const processAllDishes = async ({
  taskId,
}: { taskId?: string } = {}): Promise<ProcessingResult> => {
  const logger = getLogger()

  const dishes = await sdk.dishes.list({ pagination: false })
  logger.i(`Processing ${dishes.items.length} dishes`)

  const result: ProcessingResult = {
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

/** Given a dish, loop through all the source adapters and fetch new dish sources with each one. Then, for each source, call `processDishFromSource` to process it. */
export const processDish = async ({
  dishId,
  taskId,
}: {
  dishId: string
  taskId?: string
}): Promise<DishResult> => {
  const logger = getLogger()
  const adapters = getAdapters()

  const dish = await sdk.dishes.get({ id: dishId })
  if (!dish) throw new Error(`Dish ${dishId} not found`)

  logger.i(`[${dish.id}] Processing "${dish.name}"`)

  const dishResult: DishResult = {
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

/** Process a dish source to extract recipes and store them in the database. */
export const processDishFromSource = async (params: {
  dishId: string
  adapter: string
  sourceUrl: string
}): Promise<SourceResult> => {
  const logger = getLogger()
  const adapters = getAdapters()

  const dish = await sdk.dishes.get({ id: params.dishId })
  if (!dish) throw new Error(`Dish ${params.dishId} not found`)

  const adapter = adapters[params.adapter as keyof typeof adapters]
  if (!adapter) throw new Error(`Adapter ${params.adapter} not found`)

  logger.i(`[${dish.id}][${params.adapter}] Processing source ${params.sourceUrl}`)

  // Extract recipes from the source (external API, catch and return error)
  let extractedRecipes
  try {
    extractedRecipes = await adapter.processDishFromSource({
      dish,
      source: { url: params.sourceUrl },
    })
  } catch (error) {
    logger.e(`[${dish.id}] Failed to extract recipes from ${params.sourceUrl}`, error)
    return {
      recipesCreated: 0,
      errors: [
        {
          context: `dish:${dish.id}/source:${params.sourceUrl}/extract`,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        },
      ],
    }
  }

  // Ensure the source URL is tracked in the database
  let processedUrl = await db.processedUrl.findUnique({ where: { url: params.sourceUrl } })
  if (!processedUrl) {
    processedUrl = await db.processedUrl.create({ data: { url: params.sourceUrl } })
  }

  const sourceErrors: ProcessingError[] = []
  let recipesCreated = 0

  for (const extractedRecipe of extractedRecipes) {
    logger.i(
      `[${dish.id}] Processing recipe: "${extractedRecipe.dish}" (confidence: ${extractedRecipe.modelConfidence})`,
    )

    // Double check that the extracted recipe matches the one we are processing.
    // This prevents storing unrelated content if the source contained more than one recipe.
    const match = await tryCatch(checkRecipeMatch({ dishName: dish.name, recipe: extractedRecipe }))
    if (!match.ok) {
      logger.e(
        `[${dish.id}] Failed to check recipe match for "${extractedRecipe.dish}"`,
        match.error,
      )
      continue
    }
    if (!match.value) {
      logger.w(
        `[${dish.id}] Skipping recipe "${extractedRecipe.dish}" because it does not match "${dish.name}"`,
      )
      continue
    }

    // Collect all unique ingredient names across all steps
    const allIngredientNames = [
      ...new Set(
        extractedRecipe.steps.flatMap((step) => step.ingredients.map((i) => i.ingredientName)),
      ),
    ]
    // Resolve each ingredient name to a database entity reference
    const ingredientIdMap = new Map<string, string | null>()
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
    const toolIdMap = new Map<string, string | null>()
    for (const name of allToolNames) {
      toolIdMap.set(name, await resolveTool(name))
    }

    // Log unresolved ingredients/tools
    for (const [name, id] of ingredientIdMap) {
      if (id == null) {
        logger.w(`[${dish.id}] Could not resolve ingredient "${name}", skipping`)
        sourceErrors.push({
          context: `dish:${dish.id}/recipe:${extractedRecipe.dish}/ingredient:${name}`,
          message: `Could not resolve ingredient "${name}"`,
        })
      }
    }
    for (const [name, id] of toolIdMap) {
      if (id == null) {
        logger.w(`[${dish.id}] Could not resolve tool "${name}", skipping`)
        sourceErrors.push({
          context: `dish:${dish.id}/recipe:${extractedRecipe.dish}/tool:${name}`,
          message: `Could not resolve tool "${name}"`,
        })
      }
    }

    // Build steps with resolved database references (skip unresolved ingredients/tools)
    const steps: Prisma.UserStepCreateInput[] = extractedRecipe.steps.map((step) => ({
      description: step.description,
      prepSeconds: step.prepSeconds ?? undefined,
      ingredients: step.ingredients
        .filter((i) => ingredientIdMap.get(i.ingredientName) != null)
        .map((i) => ({
          ingredientOrDishId: ingredientIdMap.get(i.ingredientName)!,
          quantity: i.quantity ?? undefined,
          unit: i.unit ?? undefined,
        })),
      tools: step.tools
        .filter((t) => toolIdMap.get(t.toolName) != null)
        .map((t) => ({
          tool: toolIdMap.get(t.toolName)!,
          alternatives: t.alternativeTools
            .filter((name) => toolIdMap.get(name) != null)
            .map((name) => toolIdMap.get(name)!),
        })),
    }))

    // Aggregate ingredients across all steps (deduplicated by entity ID)
    const ingredientAggregate = new Map<string, { quantity: number | null; unit: string | null }>()
    for (const step of extractedRecipe.steps) {
      for (const i of step.ingredients) {
        const id = ingredientIdMap.get(i.ingredientName)
        if (id == null) continue
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
        const id = toolIdMap.get(t.toolName)
        if (id == null) continue
        if (!toolAggregate.has(id)) {
          toolAggregate.set(id, new Set())
        }
        for (const alt of t.alternativeTools) {
          const altId = toolIdMap.get(alt)
          if (altId != null) {
            toolAggregate.get(id)!.add(altId)
          }
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
        plainTextDescription: extractedRecipe.plainTextDescription,
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
    recipesCreated++
  }

  return { recipesCreated, errors: sourceErrors }
}

/**
 * Resolve an ingredient name to a database entity reference.
 * Searches for existing ingredients, checks for semantic matches, and creates new entities when no match is found.
 * Returns null if external services (embedding, LLM) are unavailable.
 */
const resolveIngredient = async (name: string): Promise<string | null> => {
  const logger = getLogger()

  const results = await tryCatch(sdk.ingredients.search({ query: name, limit: 3 }))
  if (!results.ok) {
    logger.e(`Failed to search for ingredient "${name}"`, results.error)
    return null
  }

  console.log(results)

  for (const result of results.value) {
    const candidates = [result.ingredient.name, ...result.ingredient.nameAliases]

    let match: string | boolean
    try {
      match = await isSemanticMatch("ingredient", name, candidates)
    } catch (error) {
      logger.e(`Failed to check semantic match for ingredient "${name}"`, error)
      continue
    }

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
  const created = await sdk.ingredients.create(
    { data: { name } },
    { waitAfterEmbeddingGeneration: true },
  )
  logger.i(`Created new ingredient "${name}" (${created.id})`)
  return created.id
}

/**
 * Resolve a tool name to a database entity reference.
 * Searches for existing tools, checks for semantic matches, and creates new entities when no match is found.
 * Returns null if external services (embedding, LLM) are unavailable.
 */
const resolveTool = async (name: string): Promise<string | null> => {
  const logger = getLogger()

  let results
  try {
    results = await sdk.tools.search({ query: name, limit: 3 })
  } catch (error) {
    logger.e(`Failed to search for tool "${name}"`, error)
    return null
  }

  for (const result of results) {
    const candidates = [result.tool.name, ...result.tool.nameAliases]

    let match: string | boolean
    try {
      match = await isSemanticMatch("tool", name, candidates)
    } catch (error) {
      logger.e(`Failed to check semantic match for tool "${name}"`, error)
      continue
    }

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
  const created = await sdk.tools.create({ data: { name } }, { waitAfterEmbeddingGeneration: true })
  logger.i(`Created new tool "${name}" (${created.id})`)
  return created.id
}

/**
 * Look up a GeoNames ID for a location string using the GeoNames search API.
 * Returns the geonameId string if found, or null if the query is empty or no results are returned.
 */
const resolveGeonameId = async (location: string | undefined): Promise<string | null> => {
  if (!location?.trim()) return null

  const params = new URLSearchParams({
    q: location.trim(),
    username: env.GEONAMES_USERNAME,
    maxRows: "1",
  })

  try {
    const res = await fetch(`https://api.geonames.org/searchJSON?${params}`)
    if (!res.ok) return null

    const data = (await res.json()) as { geonames?: Array<{ geonameId: string }> }
    return data.geonames?.[0]?.geonameId ?? null
  } catch (error) {
    console.error(`Failed to look up GeoNames ID for "${location}"`, error)
    return null
  }
}
