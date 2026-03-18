import type { Dish, Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import type { ContainerOf } from "@relish/utils/types"
import { SdkError } from "~/error.ts"
import { type ListResult, PAGE_SIZE } from "~/shared.ts"

export type DishListParams = {
  page?: number
  order?: Prisma.SortOrder
  sort?: "name" | "createdAt"
  filter?: {
    name?: string
  }
}

export const createDishesClient = ({ db }: ContainerOf<"db">) => ({
  list: async (params?: DishListParams): Promise<ListResult<Dish>> => {
    const page = Math.max(1, Math.floor(params?.page ?? 1))
    const order = params?.order ?? "desc"
    const sort = params?.sort ?? "createdAt"

    const where: Prisma.DishWhereInput = {}
    if (params?.filter?.name?.trim()) {
      where.name = { contains: params.filter.name.trim() }
    }

    const primaryOrderBy: Prisma.DishOrderByWithRelationInput =
      sort === "name" ? { name: order } : { createdAt: order }

    const [totalItemCount, items] = await Promise.all([
      db.dish.count({ where }),
      db.dish.findMany({
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

  create: async (params: { data: Omit<Prisma.DishCreateInput, "nameEmbedding"> }) => {
    const nameEmbedding = await toEmbedding(params.data.name)
    const item = await db.dish.create({ data: { ...params.data, nameEmbedding } })
    return item
  },

  get: async (params: { id: string }) => {
    const item = await db.dish.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    return item
  },

  update: async (params: {
    id: string
    data: Omit<Prisma.DishUpdateInput, "nameEmbedding" | "name"> & {
      name?: string
    }
  }) => {
    const item = await db.dish.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })

    let data: Prisma.DishUpdateInput = params.data
    if (params.data.name && params.data.name !== item.name) {
      const nameEmbedding = await toEmbedding(params.data.name)
      data = { ...params.data, nameEmbedding }
    }

    const updatedItem = await db.dish.update({ where: { id: params.id }, data })
    return updatedItem
  },

  delete: async (params: { id: string }) => {
    const item = await db.dish.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const deletedItem = await db.dish.delete({ where: { id: params.id } })
    return deletedItem
  },
})
