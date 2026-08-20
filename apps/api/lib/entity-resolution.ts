import { getLogger } from "@relish/di"
import { env } from "@relish/env"
import { isSemanticMatch } from "@relish/recipe-processing"
import { sdk } from "@relish/sdk"
import { tryCatch } from "@relish/utils/try"

/**
 * Resolve an ingredient name to a database entity reference.
 * Searches for existing ingredients, checks for semantic matches, and creates new entities when no match is found.
 * Returns null if external services (embedding, LLM) are unavailable.
 */
export const resolveIngredient = async (name: string): Promise<string | null> => {
  const logger = getLogger()

  const results = await tryCatch(sdk.ingredients.search({ query: name, limit: 3 }))
  if (!results.ok) {
    logger.e(`Failed to search for ingredient "${name}"`, results.error)
    return null
  }

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
export const resolveTool = async (name: string): Promise<string | null> => {
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
export const resolveGeonameId = async (location: string | undefined): Promise<string | null> => {
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
