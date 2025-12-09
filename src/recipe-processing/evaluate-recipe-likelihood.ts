import { openai } from "@ai-sdk/openai"
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
