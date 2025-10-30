import { openai } from "@ai-sdk/openai"
import jsonSchema from "@relish/storage/json-schema.json" with { type: "json" }
import { generateText } from "ai"
import { z } from "zod"

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
- Output must be a valid JSON object (or an array of JSON objects if multiple recipes are found). Only output valid JSON: no markdown, no additional text.
- The JSON must strictly conform to one of the following structures:
  - If the extraction was successful:
    \`\`\`json
    {
      "result": <either an object (single recipe found) or an array of objects (multiple recipes found)>
      "confidence": number
    }
    \`\`\`
  - If the extraction failed:
    \`\`\`json
    {
      "result": null
      "confidence": 0.0
    }
    \`\`\`
- In the above JSON objects:
  - \`result\` should adhere to the JSON schema provided below, without extra fields or explanations.
  - \`confidence\` should be in a 0-1 range, estimating your confidence in the accuracy and completeness of the extraction (1.0 = highly confident, text is a recipe and clear instructions are given, 0.5 = partial or uncertain extraction, 0.0 = no valid recipe information found).
- Always output the recipe in English, even if the input text is in another language. Translate ingredient names and steps to English, but stick to the original language for typical terms.
- Strictly report only what's in the text without making up any additional information.

Here is the JSON schema you must strictly follow:

${JSON.stringify(jsonSchema, null, 2)}
`

// TODO: remove ids?
// TODO: validate result using the Prisma Zod Schema

export const extractRecipe = async (text: string) => {
  const { text: rawResult } = await generateText({
    model: extractionModel,
    system: extractionPrompt,
    messages: [{ role: "user", content: text }],
  })
  return rawResult
}
