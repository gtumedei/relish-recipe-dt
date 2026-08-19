import { db, Prisma, Recipe } from "@relish/storage"
import { SdkError } from "~/error.ts"
import { DEFAULT_PAGE_SIZE, ListResult } from "~/shared.ts"

export type RecipeListParams = {
  pagination: { pageNumber: number; pageSize?: number } | false
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

export const createRecipesClient = () => {
  return {
    list: async (params: RecipeListParams): Promise<ListResult<Recipe>> => {
      const page = params.pagination ? Math.max(1, Math.floor(params.pagination.pageNumber)) : 1
      const pageSize = params.pagination
        ? (params.pagination.pageSize ?? DEFAULT_PAGE_SIZE)
        : undefined
      const order = params.order ?? "desc"
      const sort = params.sort ?? "createdAt"

      const where: Prisma.RecipeWhereInput = {}
      if (params.filter?.dishId) {
        where.dishId = params.filter.dishId
      }
      if (params.filter?.ingredient) {
        where.ingredients = { some: { ingredientOrDishId: params.filter.ingredient } }
      }
      if (params.filter?.tool) {
        where.tools = { some: { tool: params.filter.tool } }
      }
      if (
        typeof params.filter?.totalPrepSecondsMin === "number" ||
        typeof params.filter?.totalPrepSecondsMax === "number"
      ) {
        where.totalPrepSeconds = {
          gte: params.filter?.totalPrepSecondsMin,
          lte: params.filter?.totalPrepSecondsMax,
        }
      }

      const primaryOrderBy: Prisma.RecipeOrderByWithRelationInput =
        sort === "totalPrepSeconds" ? { totalPrepSeconds: order } : { createdAt: order }

      const [totalItemCount, items] = await Promise.all([
        db.recipe.count({ where }),
        db.recipe.findMany({
          where,
          orderBy: [primaryOrderBy, { id: "asc" }],
          ...(params.pagination ? { skip: (page - 1) * pageSize!, take: pageSize } : {}),
        }),
      ])

      return {
        items,
        page,
        pageCount: params.pagination ? Math.ceil(totalItemCount / pageSize!) : 1,
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
  }
}
