import { generateObject } from "ai"
import { gpt4oMini } from "@relish/utils/ai"
import { z } from "zod"

const normalize = (name: string) =>
  name.toLowerCase().trim().replace(/[()]/g, "").replace(/[-_]/g, " ").replace(/\s+/g, " ")

const heuristicMatch = (expected: string, candidates: string[]) => {
  const normalizedExpected = normalize(expected)

  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate)

    if (normalizedCandidate === normalizedExpected) return candidate

    // Simple singular/plural handling
    if (
      normalizedCandidate === `${normalizedExpected}s` ||
      normalizedExpected === `${normalizedCandidate}s`
    )
      return candidate
  }

  return undefined
}

const ingredientPrompt = `
You are comparing two ingredient records:
- the first record contains a single ingredient name;
- the second record contains known names for another ingredient, including its canonical name and aliases.

Return match=true if both records refer to the same culinary ingredient.

Treat spelling variants, regional names, translations, and common synonyms as the same ingredient.

Do not match ingredients that are merely related, commonly substituted, or belong to the same family.

Examples:
- cilantro <-> ["coriander", "coriander leaves"] -> true
- chickpeas <-> ["garbanzo beans", "ceci"] -> true
- zucchini <-> ["courgette"] -> true
- shallot <-> ["onion", "yellow onion"] -> false
- baking soda <-> ["baking powder"] -> false
- black pepper <-> ["white pepper"] -> false
`

const toolPrompt = `
You are comparing two cooking tool records:
- the first record contains a single cooking tool name;
- the second record contains known names for another cooking tool, including its canonical name and aliases.

Return match=true if both records refer to the same cooking tool or the same standardized tool concept used interchangeably in recipes or kitchens.

Treat spelling variants, regional names, translations, and common synonyms as the same tool.

Treat minor form-factor variations as the same tool when they are functionally interchangeable in cooking (e.g. material differences, size variants, or naming conventions like "sheet pan" vs "baking sheet").

Do NOT match tools that are distinct in function, even if they are commonly used together or can substitute for each other in some recipes.

Be strict about functional differences: if two tools require different actions, produce different results, or are typically not interchangeable in professional or home cooking, return false.

Examples:
- sheet pan <-> ["baking sheet", "oven tray", "cookie sheet"] -> true
- skillet <-> ["frying pan", "pan"] -> true
- saucepan <-> ["small pot"] -> true
- blender <-> ["food processor"] -> false
- frying pan <-> ["saucepan"] -> false
- whisk <-> ["spatula"] -> false
`

/**
 * Check if an `expected` string semantically match an array of `candidates`.
 * Use a set of heuristics for a preliminary check, then pass the task to a LLM.
 *
 * @returns `string` if one of the candidates matched using the heuristics; `true` if the LLM call returned a positive match; `false` otherwise.
 */
export async function isSemanticMatch(
  type: "ingredient" | "tool",
  expected: string,
  candidates: string[],
): Promise<string | boolean> {
  const heuristic = heuristicMatch(expected, candidates)
  if (heuristic) return heuristic

  const { object } = await generateObject({
    model: gpt4oMini,
    schema: z.object({
      match: z.boolean(),
      confidence: z.number().min(0).max(1).describe("Confidence level of the result"),
      reasoning: z.string().describe("Reasoning behind the result"),
    }),
    system: type == "ingredient" ? ingredientPrompt : toolPrompt,
    prompt: JSON.stringify({ expected, candidates }, null, 2),
  })

  return object.match && object.confidence >= 0.8
}
