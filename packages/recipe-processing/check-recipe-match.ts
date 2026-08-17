import { gpt4oMini } from "@relish/utils/ai"
import { generateObject } from "ai"
import { z } from "zod"
import type { ExtractedRecipe } from "./extract-recipe.ts"

const checkRecipeMatchPrompt = `
You are an AI that determines whether an extracted recipe is an instance of a specific dish.

You will be given:
- the name of the dish we are looking for (dishName);
- the name the recipe itself claims to be (recipe.dish);
- the recipe steps, including their descriptions and ingredients.

Return match=true only if the recipe is genuinely an instance or variation of the dish we are looking for.

Rules:
- Treat regional variations, translations, and non-standard preparations as matches, as long as the core dish is the same.
- A recipe is NOT a match if it is a different dish, even if it shares some ingredients or belongs to the same category.
- Base your decision primarily on the recipe content (ingredients and steps), not just on the recipe's self-declared name.

Examples:
- dishName: "Pizza margherita", recipe: a pizza topped with spicy salami and mozzarella (diavola) -> false
- dishName: "Pasta alla carbonara", recipe: spaghetti alla carbonara with guanciale, eggs, and pecorino -> true
- dishName: "Pasta alla carbonara", recipe: an unusual oriental-style carbonara that still uses eggs, cured pork, and cheese over pasta -> true
`

/**
 * Check whether an extracted recipe is an instance of the dish we are processing.
 * Uses a LLM to compare the expected dish name against the recipe's self-declared
 * name and its content (step descriptions and ingredients).
 *
 * @returns `true` if the recipe is a match for the dish, `false` otherwise.
 */
export async function checkRecipeMatch({
  dishName,
  recipe,
}: {
  dishName: string
  recipe: Pick<ExtractedRecipe, "dish" | "steps">
}): Promise<boolean> {
  const { object } = await generateObject({
    model: gpt4oMini,
    schema: z.object({
      match: z.boolean(),
      confidence: z.number().min(0).max(1).describe("Confidence level of the result"),
      reasoning: z.string().describe("Reasoning behind the result"),
    }),
    system: checkRecipeMatchPrompt,
    prompt: JSON.stringify(
      {
        dishName,
        recipeDish: recipe.dish,
        steps: recipe.steps.map((step) => ({
          description: step.description,
          ingredients: step.ingredients.map((i) => i.ingredientName),
        })),
      },
      null,
      2,
    ),
  })

  return object.match && object.confidence >= 0.8
}
