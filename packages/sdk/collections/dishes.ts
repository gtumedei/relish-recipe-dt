import { Dish, Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { Requires, resolve } from "@relish/utils/di"
import { SdkError } from "~/error.ts"
import { DEFAULT_PAGE_SIZE, ListResult } from "~/shared.ts"

export type DishListParams = {
  pagination: { pageNumber: number; pageSize?: number } | false
  order?: Prisma.SortOrder
  sort?: "name" | "createdAt"
  filter?: {
    name?: string
  }
}

export type DishSearchParams = {
  query: string
  limit?: number
  minScore?: number
}

export type DishSearchResult = {
  dish: Dish
  score: number
}

export function createDishesClient(this: Requires<"db">) {
  const { db } = resolve(this)

  return {
    list: async (params: DishListParams): Promise<ListResult<Dish>> => {
      const page = params.pagination ? Math.max(1, Math.floor(params.pagination.pageNumber)) : 1
      const pageSize = params.pagination
        ? (params.pagination.pageSize ?? DEFAULT_PAGE_SIZE)
        : undefined
      const order = params.order ?? "desc"
      const sort = params.sort ?? "createdAt"

      const where: Prisma.DishWhereInput = {}
      if (params.filter?.name?.trim()) {
        where.name = { contains: params.filter.name.trim() }
      }

      const primaryOrderBy: Prisma.DishOrderByWithRelationInput =
        sort === "name" ? { name: order } : { createdAt: order }

      const [totalItemCount, items] = await Promise.all([
        db.dish.count({ where }),
        db.dish.findMany({
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

    search: async (params: DishSearchParams): Promise<DishSearchResult[]> => {
      if (!params.query.trim())
        throw new SdkError({ code: "BAD_REQUEST", message: "Search query must not be empty" })

      const queryEmbedding = await toEmbedding(params.query.trim())
      const limit = params.limit ?? DEFAULT_PAGE_SIZE

      const res = (await db.dish.aggregateRaw({
        pipeline: [
          {
            $vectorSearch: {
              index: "Dish_nameEmbedding_vector_index",
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

      const resItems = await db.dish.findMany({
        where: { id: { in: res.map((record) => record._id.$oid) } },
      })

      const results = res
        .map((record) => {
          const item = resItems.find((it) => it.id == record._id.$oid)
          if (!item) return null as unknown as DishSearchResult // It's fine since we filter it out right after anyway
          return { dish: item, score: record.score }
        })
        .filter((it) => !!it && it.score >= (params.minScore ?? 0))

      return results
    },

    create: async (
      params: { data: Omit<Prisma.DishCreateInput, "nameEmbedding"> },
      { waitAfterEmbeddingGeneration = false }: { waitAfterEmbeddingGeneration?: boolean } = {},
    ) => {
      const nameEmbedding = await toEmbedding(params.data.name)
      const item = await db.dish.create({ data: { ...params.data, nameEmbedding } })
      if (waitAfterEmbeddingGeneration) await new Promise((r) => setTimeout(r, 1000))
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
}
