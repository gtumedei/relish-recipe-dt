import type { ExtractedRecipe } from "@relish/recipe-processing"
import type { Dish } from "@relish/sdk"
import { createYoutubeAdapter } from "./youtube.ts"
export { YoutubeSearchParametersSchema, type YoutubeSearchParameters } from "./search-metadata.ts"

export type SourceAdapter<
  TSource extends { url: string } = { url: string; [key: string]: unknown },
  TFindParams extends { dish: Dish } = {
    dish: Dish
    [key: string]: unknown
  },
  TProcessParams extends { dish: Dish; source: TSource } = {
    dish: Dish
    source: TSource
    [key: string]: unknown
  },
> = {
  /** Find and return recipe source for a given dish. */
  findDishSources: (params: TFindParams) => Promise<TSource[]>

  /** Process a given dish source and return the extracted recipes. */
  processDishFromSource: (params: TProcessParams) => Promise<ExtractedRecipeWithMetadata[]>

  [key: string]: unknown
}

export type ExtractedRecipeWithMetadata = ExtractedRecipe & {
  source: string
  index: number
  modelConfidence: number
  plainTextDescription: string
  location?: string
  language?: string
}

export const createAdapters = () => ({
  youtube: createYoutubeAdapter(),
})

export type Adapters = ReturnType<typeof createAdapters>
