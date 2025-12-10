import type { ExtractedRecipe } from "@relish/recipe-processing"

export type ExtractedRecipeWithMetadata = ExtractedRecipe & {
  source: string
  index: number
  modelConfidence: number
  location?: string
  language?: string
}
