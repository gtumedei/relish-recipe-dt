import { openai } from "@ai-sdk/openai"
import { db, type Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { logger } from "@relish/utils/logger"
import { generateObject } from "ai"
import { z } from "zod"

const extractionModel = openai("gpt-4o-mini")
const extractionPrompt = `
You are an expert culinary information extraction model.
You receive informal or noisy text (e.g., posts or video transcriptions from social media). These texts may contain unrelated commentary, anecdotes, or filler language.

Your task is to identify and extract only the structured recipe information contained in the text.

Follow these rules:
- Ignore non-recipe content (introductions, jokes, ads, etc.).
- Always output the recipe in English, even if the input text is in another language. Translate ingredient names and steps to English, but stick to the original language for typical terms.
- Strictly report only what's in the text without making up any additional information.
`

const InitialRecipeSchema = z.object({
  dish: z.string(),
  steps: z.array(
    z.object({
      description: z.string(),
      ingredients: z.array(
        z.object({
          ingredientName: z.string(),
          quantity: z.number().nullish(),
          unit: z
            .string()
            .nullish()
            .describe(
              `Set to "units" if the ingredient has a quantity but not a specific unit (e.g. 4 eggs)`
            ),
        })
      ),
      tools: z.array(
        z.object({
          toolName: z.string(),
          alternativeTools: z.array(z.string()),
        })
      ),
      prepSeconds: z.number().nullish(),
    })
  ),
})

export type ExtractedRecipe = Pick<
  Prisma.UserRecipeCreateManyInput,
  "ingredients" | "tools" | "steps" | "totalPrepSeconds"
>

export const extractRecipe = async (text: string) => {
  // Generate structured recipe
  logger.i("Extracting recipe from text")
  const { object: initialRecipes } = await generateObject({
    model: extractionModel,
    system: extractionPrompt /* "Convert this text into a list of structured recipes." */,
    schema: z.object({
      result: z.array(InitialRecipeSchema),
      confidence: z.number().min(0).max(1).describe("How certain you are about the end result"),
    }),
    prompt: text,
  })
  return initialRecipes
}

export const extractRecipeWithDbEntities = async (text: string): Promise<ExtractedRecipe[]> => {
  const initialRecipes = await extractRecipe(text)

  // Find existing ingredients from the recipe in the db
  const ingredientNames = [
    ...new Set(
      initialRecipes.result.flatMap((r) =>
        r.steps.flatMap((s) => s.ingredients.map((i) => i.ingredientName))
      )
    ),
  ]
  logger.i(`Finding ${ingredientNames.length} ingredients in the database`)
  const dbIngredients = await Promise.all(ingredientNames.map(findOrCreateIngredient))

  // Find existing tools (and alternatives) from the recipe in the db
  // All tools flattened
  const allToolNames = [
    ...new Set(
      initialRecipes.result.flatMap((r) =>
        r.steps.flatMap((s) => [
          ...s.tools.map((t) => t.toolName),
          ...s.tools.flatMap((t) => t.alternativeTools),
        ])
      )
    ),
  ]
  // Tools from all steps, but keeping the tool-alternatives structure
  const toolNamesWithAlternatives = initialRecipes.result
    .flatMap((r) => r.steps.flatMap((s) => s.tools))
    .reduce(
      (acc, tool) => {
        const accTool = acc.find((t) => t.toolName == tool.toolName)
        if (accTool) {
          accTool.alternativeTools.push(...tool.alternativeTools)
          accTool.alternativeTools = [...new Set(accTool.alternativeTools)]
        } else {
          acc.push(tool)
        }
        return acc
      },
      [] as {
        toolName: string
        alternativeTools: string[]
      }[]
    )
  logger.i(`Finding ${allToolNames.length} tools in the database`)
  const dbTools = await Promise.all(allToolNames.map(findOrCreateTool))

  // TODO: subrecipes?

  // Regenerate the recipe reusing existing entities
  const res: ExtractedRecipe[] = initialRecipes.result.map((recipe) => ({
    // Gather all ingredient references and quantities
    ingredients: dbIngredients.map((ingredient) => {
      const { partial, ...amount } = recipe.steps
        .flatMap((s) => s.ingredients)
        .filter((i) => i.ingredientName == ingredient.string)
        .reduce(
          (acc, i) => {
            // Can't compute total quantity if:
            // - Some steps don't have quantity or unit
            // - Units don't match across all steps (TODO: this could be fixed with a unit-to-unit conversion)
            if (acc.partial) return acc
            if (typeof i.quantity != "number" || !i.unit || (acc.unit && acc.unit != i.unit)) {
              acc.partial = true
              return acc
            }
            acc.quantity += i.quantity
            acc.unit = i.unit
            return acc
          },
          { partial: false, quantity: 0, unit: null as string | null }
        )
      const ref = {
        ingredientOrDishId: ingredient.document.id,
        ...(partial ? {} : amount),
      }
      return ref
    }),
    // Gather all tools and alternatives
    tools: toolNamesWithAlternatives.map((t) => ({
      tool: dbTools.find((dbTool) => dbTool.string == t.toolName)!.document.id,
      alternatives: t.alternativeTools.map(
        (name) => dbTools.find((dbTool) => dbTool.string == name)!.document.id
      ),
    })),
    steps: recipe.steps.map((step) => ({
      description: step.description,
      // Replace ingredient names with ObjectIds
      ingredients: step.ingredients.map((ingredient) => ({
        ...ingredient,
        ingredientOrDishId:
          dbIngredients.find((i) => i.string == ingredient.ingredientName)!.document.id ?? "",
      })),
      // Replace tool names with ObjectIds
      tools: step.tools.map((t) => ({
        tool: dbTools.find((dbTool) => dbTool.string == t.toolName)!.document.id,
        alternatives: t.alternativeTools.map(
          (name) => dbTools.find((dbTool) => dbTool.string == name)!.document.id
        ),
      })),
      prepSeconds: step.prepSeconds,
    })),
    // Compute total prep seconds by summing individual steps
    totalPrepSeconds: recipe.steps.reduce((tot, step) => tot + (step.prepSeconds ?? 0), 0),
  }))
  return res
}

const semanticDecisionPrompt = `
You are an expert cook. You'll receive a pair of ingredient names: one is the ingredient you need, the other is the closest match found in an existing list. You job is to output a boolean value indicating whether the provided name and the closest match are the **same exact ingredient**.

Guidelines:
- Ignore capitalization and minor punctuation differences.
- Consider singular and plural names as the **same ingredient** (e.g. "tomato" and "tomatoes" are the same).
- Consider names in different languages to be the **same ingredient** (e.h. "tomato" and "pomodoro" are the same).
- Consider "tomato" and "tomato sauce" as **different ingredients**.
- Consider "flour" and "flour (00)" as **different ingredients**.

Examples:
- Ingredient name: "sugar"
  Closest match: "sugar"
  Result: \`{ "match": true }\`

- Ingredient name: "tomato"
  Closest match: "tomato sauce"
  Result: \`{ "match": false }\`

- Ingredient name: "pomodoro"
  Closest match: "tomato"
  Result: \`{ "match": true }\`

- Ingredient name: "tomatoes"
  Closest match: "tomato"
  Result: \`{ "match": true }\`

- Ingredient name: "flour"
  Closest match: "flour (00)"
  Result: \`{ "match": false }\`
`

type SemanticFindResultCode = "SUCCESS" | "NOT_FOUND" | "DECISION_NOT_PASSED"

const findIngredientSemantically = async (parameters: {
  query: string
  embedding?: number[]
}): Promise<{ code: SemanticFindResultCode; data?: any }> => {
  // Semantic search
  const queryEmbedding = parameters.embedding ?? (await toEmbedding(parameters.query))
  const res = await db.ingredient.aggregateRaw({
    pipeline: [
      {
        $vectorSearch: {
          index: "Ingredient_nameEmbedding_vector_index",
          path: "nameEmbedding",
          queryVector: queryEmbedding,
          numCandidates: 200,
          limit: 5,
        },
      },
      {
        $project: {
          name: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ],
  })
  if (!Array.isArray(res) || res.length == 0) return { code: "NOT_FOUND" }
  const matchName = res[0].name
  // LLM decision
  const { object: dec } = await generateObject({
    model: extractionModel,
    system: semanticDecisionPrompt,
    schema: z.object({
      match: z.boolean(),
    }),
    prompt: `Ingredient name: "${parameters.query}"\nClosest match: "${matchName}"`,
  })
  return dec.match ? { code: "SUCCESS", data: res[0] } : { code: "DECISION_NOT_PASSED" }
}

const findOrCreateIngredient = async (ingredientName: string) => {
  logger.i(`Searching for "${ingredientName}" references`)
  const nameEmbedding = await toEmbedding(ingredientName)
  const res = await findIngredientSemantically({ query: ingredientName, embedding: nameEmbedding })
  if (res.data) {
    logger.s(`Reference found for "${ingredientName}"`)
    const ingredientFromDb = await db.ingredient.findUnique({
      where: { id: res.data._id.$oid },
    })
    if (!ingredientFromDb)
      throw new Error(
        `ObjectId "${res.data._id.$oid}" returned from an aggregation does not match with Prisma`
      )
    return { string: ingredientName, document: ingredientFromDb }
  } else {
    logger.i(`No reference found for "${ingredientName}": creating new database entry`)
    const ingredientFromDb = await db.ingredient.create({
      data: { name: ingredientName, nameEmbedding },
    })
    return { string: ingredientName, document: ingredientFromDb }
  }
}

const findToolSemantically = async (parameters: {
  query: string
  embedding?: number[]
}): Promise<{ code: SemanticFindResultCode; data?: any }> => {
  // Semantic search
  const queryEmbedding = parameters.embedding ?? (await toEmbedding(parameters.query))
  const res = await db.tool.aggregateRaw({
    pipeline: [
      {
        $vectorSearch: {
          index: "Tool_nameEmbedding_vector_index",
          path: "nameEmbedding",
          queryVector: queryEmbedding,
          numCandidates: 200,
          limit: 5,
        },
      },
      {
        $project: {
          name: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ],
  })
  if (!Array.isArray(res) || res.length == 0) return { code: "NOT_FOUND" }
  const matchName = res[0].name
  // LLM decision
  const { object: dec } = await generateObject({
    model: extractionModel,
    system:
      "You are an expert cook. You'll receive a pair of tool names: one is the tool you need to prepare a recipe, the other is the closest match found in an existing list. You job is to output a boolean value indicating whether the provided name and the closest match are the **same exact tool**.",
    schema: z.object({
      match: z.boolean(),
    }),
    prompt: `Tool name: "${parameters.query}"\nClosest match: "${matchName}"`,
  })
  return dec.match ? { code: "SUCCESS", data: res[0] } : { code: "DECISION_NOT_PASSED" }
}

const findOrCreateTool = async (toolName: string) => {
  logger.i(`Searching for "${toolName}" references`)
  const nameEmbedding = await toEmbedding(toolName)
  const res = await findToolSemantically({ query: toolName, embedding: nameEmbedding })
  if (res.data) {
    logger.s(`Reference found for "${toolName}"`)
    const toolFromDb = await db.tool.findUnique({
      where: { id: res.data._id.$oid },
    })
    if (!toolFromDb)
      throw new Error(
        `ObjectId "${res.data._id.$oid}" returned from an aggregation does not match with Prisma`
      )
    return { string: toolName, document: toolFromDb }
  } else {
    logger.i(`No reference found for "${toolName}": creating new database entry`)
    const toolFromDb = await db.tool.create({
      data: { name: toolName, nameEmbedding },
    })
    return { string: toolName, document: toolFromDb }
  }
}
