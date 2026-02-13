import { db, type Prisma, type Tool } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { SdkError } from "~/error.ts"

export const tools = {
  list: async () => {
    const items = await db.tool.findMany()
    return items
  },

  create: async (params: { data: Omit<Prisma.ToolCreateInput, "nameEmbedding"> }) => {
    const nameEmbedding = await toEmbedding(params.data.name)
    const item = await db.tool.create({ data: { ...params.data, nameEmbedding } })
    return item
  },

  get: async (params: { id: string }) => {
    const item = await db.tool.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    return item
  },

  update: async (params: {
    id: string
    data: Omit<Prisma.ToolUpdateInput, "nameEmbedding" | "name"> & {
      name?: string
    }
  }) => {
    const item = await db.tool.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })

    let data: Prisma.ToolUpdateInput = params.data
    if (params.data.name && params.data.name !== item.name) {
      const nameEmbedding = await toEmbedding(params.data.name)
      data = { ...params.data, nameEmbedding }
    }

    const updatedItem = await db.tool.update({ where: { id: params.id }, data })
    return updatedItem
  },

  delete: async (params: { id: string }) => {
    const item = await db.tool.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const deletedItem = await db.tool.delete({ where: { id: params.id } })
    return deletedItem
  },
}

export type { Tool }
