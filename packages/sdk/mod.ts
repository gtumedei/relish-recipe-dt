import type { ContainerOf } from "@relish/utils/types"
import { createApiKeysClient } from "~/collections/api-keys.ts"
import { createDishesClient } from "~/collections/dishes.ts"
import { createIngredientsClient } from "~/collections/ingredients.ts"
import { createRecipeInstancesClient } from "~/collections/recipe-instances.ts"
import { createRecipesClient } from "~/collections/recipes.ts"
import { createToolsClient } from "~/collections/tools.ts"

export {
  CollectionAccessSchema,
  type AccessRule,
  type ProtectedCollection,
} from "~/collections/api-keys.ts"
export type { DishListParams } from "~/collections/dishes.ts"
export type { IngredientListParams } from "~/collections/ingredients.ts"
export type { RecipeInstanceListParams } from "~/collections/recipe-instances.ts"
export type { RecipeListParams } from "~/collections/recipes.ts"
export type { ToolListParams } from "~/collections/tools.ts"
export * from "~/error.ts"

export const createSdkClient = (deps: ContainerOf<"db">) => {
  return {
    apiKeys: createApiKeysClient(deps),
    dishes: createDishesClient(deps),
    ingredients: createIngredientsClient(deps),
    recipes: createRecipesClient(deps),
    recipeInstances: createRecipeInstancesClient(deps),
    tools: createToolsClient(deps),
  }
}

export type SdkClient = ReturnType<typeof createSdkClient>
