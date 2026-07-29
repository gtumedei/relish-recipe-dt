import { Tool } from "@relish/sdk"
import { Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { Requires, resolve } from "@relish/utils/di"
import { SdkError } from "~/error.ts"
import { DEFAULT_PAGE_SIZE, ListResult } from "~/shared.ts"

export type ToolListParams = {
  pagination: { pageNumber: number; pageSize?: number } | false
  order?: Prisma.SortOrder
  sort?: "createdAt"
  filter?: {
    name?: string
  }
}

export type ToolSearchParams = {
  query: string
  limit?: number
  minScore?: number
}

export type ToolSearchResult = {
  tool: Tool
  score: number
}

export function createToolsClient(this: Requires<"db">) {
  const { db } = resolve(this)

  return {
    list: async (params: ToolListParams): Promise<ListResult<Tool>> => {
      const page = params.pagination ? Math.max(1, Math.floor(params.pagination.pageNumber)) : 1
      const pageSize = params.pagination
        ? (params.pagination.pageSize ?? DEFAULT_PAGE_SIZE)
        : undefined
      const order = params.order ?? "desc"

      const where: Prisma.ToolWhereInput = {}
      if (params.filter?.name?.trim()) {
        where.name = { contains: params.filter.name.trim() }
      }

      const [totalItemCount, items] = await Promise.all([
        db.tool.count({ where }),
        db.tool.findMany({
          where,
          orderBy: [{ createdAt: order }, { id: "asc" }],
          omit: { nameEmbedding: true },
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

    search: async (params: ToolSearchParams): Promise<ToolSearchResult[]> => {
      if (!params.query.trim())
        throw new SdkError({ code: "BAD_REQUEST", message: "Search query must not be empty" })

      const queryEmbedding = await toEmbedding(params.query.trim())
      const limit = params.limit ?? DEFAULT_PAGE_SIZE

      const res = (await db.tool.aggregateRaw({
        pipeline: [
          {
            $vectorSearch: {
              index: "Tool_nameEmbedding_vector_index",
              path: "nameEmbedding",
              queryVector: queryEmbedding,
              numCandidates: 200,
              limit,
            },
          },
          {
            $project: {
              score: { $meta: "vectorSearchScore" },
            },
          },
        ],
      })) as unknown as { _id: { $oid: string }; score: number }[]

      if (!Array.isArray(res)) return []

      const resItems = await db.tool.findMany({
        where: { id: { in: res.map((record) => record._id.$oid) } },
        omit: { nameEmbedding: true },
      })

      const results = res
        .map((record) => {
          const item = resItems.find((it) => it.id == record._id.$oid)
          if (!item) return null as unknown as ToolSearchResult // It's fine since we filter it out right after anyway
          return { tool: item, score: record.score }
        })
        .filter((it) => !!it && it.score >= (params.minScore ?? 0))

      return results
    },

    create: async (
      params: { data: Omit<Prisma.ToolCreateInput, "nameEmbedding"> },
      { waitAfterEmbeddingGeneration = false }: { waitAfterEmbeddingGeneration?: boolean } = {},
    ): Promise<Tool> => {
      const nameEmbedding = await toEmbedding(params.data.name)
      const item = await db.tool.create({
        data: { ...params.data, nameEmbedding },
        omit: { nameEmbedding: true },
      })
      if (waitAfterEmbeddingGeneration) await new Promise((r) => setTimeout(r, 1000))
      return item
    },

    get: async (params: { id: string }): Promise<Tool> => {
      const item = await db.tool.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      return item
    },

    update: async (params: {
      id: string
      data: Omit<Prisma.ToolUpdateInput, "nameEmbedding" | "name"> & {
        name?: string
      }
    }): Promise<Tool> => {
      const item = await db.tool.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })

      let data: Prisma.ToolUpdateInput = params.data
      if (params.data.name && params.data.name !== item.name) {
        const nameEmbedding = await toEmbedding(params.data.name)
        data = { ...params.data, nameEmbedding }
      }

      const updatedItem = await db.tool.update({
        where: { id: params.id },
        data,
        omit: { nameEmbedding: true },
      })
      return updatedItem
    },

    delete: async (params: { id: string }): Promise<Tool> => {
      const item = await db.tool.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      const deletedItem = await db.tool.delete({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      return deletedItem
    },
  }
}
