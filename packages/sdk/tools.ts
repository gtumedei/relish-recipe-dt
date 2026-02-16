import { db, type Prisma, type Tool } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { SdkError } from "~/error.ts"
import { type ListResult, PAGE_SIZE } from "~/shared.ts"

export type ToolListParams = {
  page?: number
  order?: Prisma.SortOrder
  sort?: "createdAt"
  filter?: {
    name?: string
  }
}

export const tools = {
  list: async (params?: ToolListParams): Promise<ListResult<Tool>> => {
    const page = Math.max(1, Math.floor(params?.page ?? 1))
    const order = params?.order ?? "desc"

    const where: Prisma.ToolWhereInput = {}
    if (params?.filter?.name?.trim()) {
      where.name = { contains: params.filter.name.trim() }
    }

    const [totalItemCount, items] = await Promise.all([
      db.tool.count({ where }),
      db.tool.findMany({
        where,
        orderBy: [{ createdAt: order }, { id: "asc" }],
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
