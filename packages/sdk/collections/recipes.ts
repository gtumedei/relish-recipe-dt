import { Prisma, Recipe } from "@relish/storage"
import { ContainerOf } from "@relish/utils/types"
import { SdkError } from "~/error.ts"
import { ListResult, PAGE_SIZE } from "~/shared.ts"

export type RecipeListParams = {
  page?: number
  order?: Prisma.SortOrder
  sort?: "totalPrepSeconds" | "createdAt"
  filter?: {
    dishId?: string
    ingredient?: string
    tool?: string
    totalPrepSecondsMin?: number
    totalPrepSecondsMax?: number
  }
}

export const createRecipesClient = ({ db }: ContainerOf<"db">) => ({
  list: async (params?: RecipeListParams): Promise<ListResult<Recipe>> => {
    const page = Math.max(1, Math.floor(params?.page ?? 1))
    const order = params?.order ?? "desc"
    const sort = params?.sort ?? "createdAt"

    const where: Prisma.RecipeWhereInput = {}
    if (params?.filter?.dishId) {
      where.dishId = params.filter.dishId
    }
    if (params?.filter?.ingredient) {
      where.ingredients = { some: { ingredientOrDishId: params.filter.ingredient } }
    }
    if (params?.filter?.tool) {
      where.tools = { some: { tool: params.filter.tool } }
    }
    if (
      typeof params?.filter?.totalPrepSecondsMin === "number" ||
      typeof params?.filter?.totalPrepSecondsMax === "number"
    ) {
      where.totalPrepSeconds = {
        gte: params?.filter?.totalPrepSecondsMin,
        lte: params?.filter?.totalPrepSecondsMax,
      }
    }

    const primaryOrderBy: Prisma.RecipeOrderByWithRelationInput =
      sort === "totalPrepSeconds" ? { totalPrepSeconds: order } : { createdAt: order }

    const [totalItemCount, items] = await Promise.all([
      db.recipe.count({ where }),
      db.recipe.findMany({
        where,
        orderBy: [primaryOrderBy, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])

    return {
      items,
      page,
      pageCount: Math.ceil(totalItemCount / PAGE_SIZE),
      totalItemCount,
    }
  },

  create: async (params: { data: Prisma.RecipeUncheckedCreateInput }) => {
    const item = await db.recipe.create({ data: params.data })
    return item
  },

  get: async (params: { id: string }) => {
    const item = await db.recipe.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    return item
  },

  update: async (params: { id: string; data: Prisma.RecipeUncheckedUpdateInput }) => {
    const item = await db.recipe.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const updatedItem = await db.recipe.update({ where: { id: params.id }, data: params.data })
    return updatedItem
  },

  delete: async (params: { id: string }) => {
    const item = await db.recipe.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const deletedItem = await db.recipe.delete({ where: { id: params.id } })
    return deletedItem
  },
})
