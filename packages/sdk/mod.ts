import type { YoutubeSearchParameters } from "@relish/source-adapters"
import {
  Dish as DishWithEmbeddings,
  Ingredient as IngredientWithEmbeddings,
  Tool as ToolWithEmbeddings,
} from "@relish/storage"
import { createApiKeysClient } from "~/collections/api-keys.ts"
import { createDishesClient } from "~/collections/dishes.ts"
import { createIngredientsClient } from "~/collections/ingredients.ts"
import { createRecipeInstancesClient } from "~/collections/recipe-instances.ts"
import { createRecipesClient } from "~/collections/recipes.ts"
import { createToolsClient } from "~/collections/tools.ts"
export * from "~/error.ts"

export {
  CollectionAccessSchema,
  type AccessRule,
  type ProtectedCollection,
} from "~/collections/api-keys.ts"
export type { DishCreateInput, DishListParams, DishUpdateInput } from "~/collections/dishes.ts"
export type { IngredientListParams } from "~/collections/ingredients.ts"
export type { RecipeInstanceListParams } from "~/collections/recipe-instances.ts"
export type { RecipeListParams } from "~/collections/recipes.ts"
export type { ToolListParams } from "~/collections/tools.ts"

export type SearchMetadata = {
  youtube: YoutubeSearchParameters | null
}

export type Dish = Omit<DishWithEmbeddings, "nameEmbedding" | "searchMetadata"> & {
  searchMetadata: SearchMetadata
}
export type Ingredient = Omit<IngredientWithEmbeddings, "nameEmbedding">
export type Tool = Omit<ToolWithEmbeddings, "nameEmbedding">

export const createSdkClient = () => {
  return {
    apiKeys: createApiKeysClient(),
    dishes: createDishesClient(),
    ingredients: createIngredientsClient(),
    recipes: createRecipesClient(),
    recipeInstances: createRecipeInstancesClient(),
    tools: createToolsClient(),
  }
}

export type SdkClient = ReturnType<typeof createSdkClient>

export const sdk = createSdkClient()
