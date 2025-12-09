import { openai } from "@ai-sdk/openai"
import { logger } from "@relish/utils/logger"
import { generateObject } from "ai"
import { z } from "zod"
import { OpenAI } from "openai"
import { env } from "@relish/env"
import { db, Prisma } from "@relish/storage"

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
          unit: z.string().nullish(),
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

export const extractRecipe = async (text: string): Promise<Prisma.UserRecipeCreateManyInput[]> => {
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
  console.log(initialRecipes)

  // Find existing ingredients from the recipe in the db
  const ingredientNames = [
    ...new Set(
      initialRecipes.result.flatMap((r) =>
        r.steps.flatMap((s) => s.ingredients.map((i) => i.ingredientName))
      )
    ),
  ]
  logger.i(`Finding ${ingredientNames.length} ingredients in the database`)
  const ingredients = await Promise.all(
    ingredientNames.map(async (ingredient) => {
      logger.i(`Searching for "${ingredient}" references`)
      const nameEmbedding = await toEmbedding(ingredient)
      const res = await findIngredientSemantically({ query: ingredient, embedding: nameEmbedding })
      if (res.data) {
        logger.s(`Reference found for "${ingredient}"`)
        const ingredientFromDb = await db.ingredient.findUnique({
          where: { id: res.data._id.$oid },
        })
        if (!ingredientFromDb)
          throw new Error(
            `ObjectId "${res.data._id.$oid}" returned from an aggregation does not match with Prisma`
          )
        return { string: ingredient, document: ingredientFromDb }
      } else {
        logger.i(`No reference found for "${ingredient}": creating new database entry`)
        const ingredientFromDb = await db.ingredient.create({
          data: { name: ingredient, nameEmbedding },
        })
        return { string: ingredient, document: ingredientFromDb }
      }
    })
  )

  // Find existing tools (and alternatives) from the recipe in the db
  const toolNames = [
    ...new Set(
      initialRecipes.result.flatMap((r) =>
        r.steps.flatMap((s) => [
          ...s.tools.map((t) => t.toolName),
          ...s.tools.flatMap((t) => t.alternativeTools),
        ])
      )
    ),
  ]
  logger.i(`Finding ${toolNames.length} tools in the database`)
  const tools = await Promise.all(
    toolNames.map(async (tool) => {
      logger.i(`Searching for "${tool}" references`)
      const nameEmbedding = await toEmbedding(tool)
      const res = await findToolSemantically({ query: tool, embedding: nameEmbedding })
      if (res.data) {
        logger.s(`Reference found for "${tool}"`)
        const toolFromDb = await db.tool.findUnique({
          where: { id: res.data._id.$oid },
        })
        if (!toolFromDb)
          throw new Error(
            `ObjectId "${res.data._id.$oid}" returned from an aggregation does not match with Prisma`
          )
        return { string: tool, document: toolFromDb }
      } else {
        logger.i(`No reference found for "${tool}": creating new database entry`)
        const toolFromDb = await db.tool.create({
          data: { name: tool, nameEmbedding },
        })
        return { string: tool, document: toolFromDb }
      }
    })
  )

  // Regenerate the recipe reusing existing entities

  // TODO: subrecipes?

  // TODO: location + GeoNames ID

  // TODO: language?

  /* const { text: rawResult } = await generateText({
    model: extractionModel,
    system: extractionPrompt,
    messages: [{ role: "user", content: text }],
  }) */
  // const res = ExtractedRecipeSchema.parse(JSON.parse(rawResult))
  // return rawResult
  const res: Prisma.UserRecipeCreateManyInput[] = initialRecipes.result.map((recipe) => ({
    dishId: "",
    ingredients: [],
    tools: [],
    steps: [],
    totalPrepSeconds: 0,
    sourceId: "",
    location: {
      geonameId: "",
      string: "",
    },
    language: "",
  }))
  return []
}

export const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY })

const toEmbedding = async (value: string) => {
  const res = await openaiClient.embeddings.create({
    model: "text-embedding-ada-002",
    input: value,
  })
  return res.data[0].embedding
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
