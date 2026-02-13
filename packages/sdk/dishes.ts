import { db, type Dish, type Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { SdkError } from "~/error.ts"

export const dishes = {
  list: async () => {
    const items = await db.dish.findMany()
    return items
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
}

export type { Dish }
