import { getAdapters, getLogger } from "@relish/di"
import { checkRecipeMatch } from "@relish/recipe-processing"
import { sdk } from "@relish/sdk"
import { db, Prisma } from "@relish/storage"
import { tryCatch } from "@relish/utils/try"
import { resolveGeonameId, resolveIngredient, resolveTool } from "~/lib/entity-resolution.ts"
import { ProcessDishFromSourceTask, ProcessingError } from "~/tasks/types.ts"

/** Process a dish source to extract recipes and store them in the database. */
export const processDishFromSource: ProcessDishFromSourceTask = async ({
  dishId,
  adapter: adapterName,
  sourceUrl,
}) => {
  const logger = getLogger()
  const adapters = getAdapters()

  const dish = await sdk.dishes.get({ id: dishId })
  if (!dish) throw new Error(`Dish ${dishId} not found`)

  const adapter = adapters[adapterName as keyof typeof adapters]
  if (!adapter) throw new Error(`Adapter ${adapter} not found`)

  logger.i(`[${dish.id}][${adapter}] Processing source ${sourceUrl}`)

  // Extract recipes from the source (external API, catch and return error)
  let extractedRecipes
  try {
    extractedRecipes = await adapter.processDishFromSource({
      dish,
      source: { url: sourceUrl },
    })
  } catch (error) {
    logger.e(`[${dish.id}] Failed to extract recipes from ${sourceUrl}`, error)
    return {
      success: false,
      recipesCreated: 0,
      errors: [
        {
          context: `dish:${dish.id}/source:${sourceUrl}/extract`,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        },
      ],
    }
  }

  // Ensure the source URL is tracked in the database
  let processedUrl = await db.processedUrl.findUnique({ where: { url: sourceUrl } })
  if (!processedUrl) {
    processedUrl = await db.processedUrl.create({ data: { url: sourceUrl } })
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

  return { success: true, recipesCreated, errors: sourceErrors }
}
