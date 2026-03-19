import { Prisma, RecipeInstance } from "@relish/storage"
import { ContainerOf } from "@relish/utils/types"
import { SdkError } from "~/error.ts"
import { ListResult, PAGE_SIZE } from "~/shared.ts"

export type RecipeInstanceListParams = {
  page?: number
  order?: Prisma.SortOrder
  sort?: "totalPrepSeconds" | "createdAt" | "modelConfidence"
  filter?: {
    dishId?: string
    ingredient?: string
    tool?: string
    totalPrepSecondsMin?: number
    totalPrepSecondsMax?: number
    location?: string
    language?: string
  }
}

export const createRecipeInstancesClient = ({ db }: ContainerOf<"db">) => ({
  list: async (params?: RecipeInstanceListParams): Promise<ListResult<RecipeInstance>> => {
    const page = Math.max(1, Math.floor(params?.page ?? 1))
    const order = params?.order ?? "desc"
    const sort = params?.sort ?? "createdAt"

    const where: Prisma.RecipeInstanceWhereInput = {}
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
    if (params?.filter?.location?.trim()) {
      where.location = { is: { string: { contains: params.filter.location.trim() } } }
    }
    if (params?.filter?.language?.trim()) {
      where.language = params.filter.language.trim()
    }

    const primaryOrderBy: Prisma.RecipeInstanceOrderByWithRelationInput =
      sort === "totalPrepSeconds"
        ? { totalPrepSeconds: order }
        : sort === "modelConfidence"
          ? { modelConfidence: order }
          : { createdAt: order }

    const [totalItemCount, items] = await Promise.all([
      db.recipeInstance.count({ where }),
      db.recipeInstance.findMany({
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

  create: async (params: { data: Prisma.RecipeInstanceUncheckedCreateInput }) => {
    const item = await db.recipeInstance.create({ data: params.data })
    return item
  },

  get: async (params: { id: string }) => {
    const item = await db.recipeInstance.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    return item
  },

  update: async (params: { id: string; data: Prisma.RecipeInstanceUncheckedUpdateInput }) => {
    const item = await db.recipeInstance.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const updatedItem = await db.recipeInstance.update({
      where: { id: params.id },
      data: params.data,
    })
    return updatedItem
  },

  delete: async (params: { id: string }) => {
    const item = await db.recipeInstance.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const deletedItem = await db.recipeInstance.delete({ where: { id: params.id } })
    return deletedItem
  },
})
