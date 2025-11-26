import { openai } from "@ai-sdk/openai"
// import jsonSchema from "@relish/storage/json-schema.json" with { type: "json" }
// import { UserRecipeCreateOneSchema } from "@relish/storage/zod"
import { generateObject, generateText } from "ai"
import { z } from "zod"
import { logger } from "@relish/utils/logger"

const evaluationModel = openai("gpt-4o-mini")
const evaluationPrompt = `
You are an AI that evaluates whether a given piece of metadata from a social media post indicates that the post contains **instructions for preparing a dish (i.e., a recipe)**.

Your task is to carefully analyze the text and assign a rating on a **5-point certainty scale**:

- **1** = Absolutely not a recipe (completely unrelated to food or cooking)
- **2** = Very unlikely to be a recipe (mentions food but not instructional)
- **3** = Possibly a recipe (ambiguous, might include food prep but unclear)
- **4** = Likely a recipe (strong signs of step-by-step preparation, but not guaranteed)
- **5** = Absolutely a recipe (explicitly instructions for preparing a dish)

When making your decision, consider:

- Mentions of **ingredients** (e.g., "flour, sugar, butter")
- Mentions of **cooking methods** (e.g., "bake, fry, boil, chop, stir")
- Presence of **step-by-step structure** (e.g., "first, then, next, finally")
- Explicit references to **recipes** or cooking instructions
- Whether the text is just descriptive/entertainment vs. instructional

When in doubt between two scores, select the higher one.

### Input Example

\`\`\`json
{
  "title": "How to make creamy garlic pasta in 20 minutes",
  "description": "Simple recipe with step-by-step instructions.",
  "tags": #recipe #pasta #cooking,
}
\`\`\`

### Output Example

\`\`\`
5
\`\`\`

Output must be a single number, no additional text or markdown formatting.
`

const OutputSchema = z.coerce.number().min(1).max(5)

export const evaluateRecipeLikelihood = async (metadata: string) => {
  const { text } = await generateText({
    model: evaluationModel,
    system: evaluationPrompt,
    messages: [{ role: "user", content: metadata }],
  })
  const res = OutputSchema.parse(text)
  return res
}

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

export const extractRecipe = async (text: string) => {
  // Generate structured recipe
  logger.i("Extracting recipe from text")
  const { object: initialRecipe } = await generateObject({
    model: extractionModel,
    system: "Convert this text into a list of structured recipes.",
    schema: z.object({
      result: z.array(InitialRecipeSchema),
      confidence: z.number().min(0).max(1).describe("How certain you are about the end result"),
    }),
    prompt: text,
  })

  // Find existing ingredients from the recipe in the db
  logger.i("Finding existing ingredients in the database")
  const ingredients = [
    ...new Set(
      initialRecipe.result.flatMap((r) =>
        r.steps.flatMap((s) => s.ingredients.map((i) => i.ingredientName))
      )
    ),
  ]
  console.log(ingredients)

  // Find existing tools (and alternatives) from the recipe in the db
  logger.i("Finding tools ingredients in the database")
  const tools = [
    ...new Set(
      initialRecipe.result.flatMap((r) =>
        r.steps.flatMap((s) => [
          ...s.tools.map((t) => t.toolName),
          ...s.tools.flatMap((t) => t.alternativeTools),
        ])
      )
    ),
  ]
  console.log(tools)

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
}
