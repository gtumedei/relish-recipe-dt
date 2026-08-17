import type { Dish, SearchMetadata } from "@relish/sdk"
import { YoutubeSearchParametersSchema } from "@relish/source-adapters"
import { Prisma } from "@relish/storage"
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

export type DishCreateInput = Omit<Prisma.DishCreateInput, "nameEmbedding" | "name"> & {
  name: string
}

export type DishUpdateInput = Omit<Prisma.DishUpdateInput, "nameEmbedding" | "name"> & {
  name?: string
}

const validateSearchMetadata = (searchMetadata: SearchMetadata | undefined) => {
  if (searchMetadata?.youtube) {
    const parsed = YoutubeSearchParametersSchema.safeParse(searchMetadata.youtube)
    if (!parsed.success) {
      throw new SdkError({ code: "BAD_REQUEST", message: "Invalid youtube search metadata" })
    }
  }
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
          omit: { nameEmbedding: true },
          ...(params.pagination ? { skip: (page - 1) * pageSize!, take: pageSize } : {}),
        }),
      ])

      return {
        items: items as unknown as Dish[],
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
        omit: { nameEmbedding: true },
      })

      const results = res
        .map((record) => {
          const item = resItems.find((it) => it.id == record._id.$oid)
          if (!item) return null as unknown as DishSearchResult // It's fine since we filter it out right after anyway
          return { dish: item, score: record.score }
        })
        .filter((it) => !!it && it.score >= (params.minScore ?? 0))

      return results as unknown as DishSearchResult[]
    },

    create: async (
      params: { data: DishCreateInput },
      { waitAfterEmbeddingGeneration = false }: { waitAfterEmbeddingGeneration?: boolean } = {},
    ): Promise<Dish> => {
      validateSearchMetadata(params.data.searchMetadata as any)
      const nameEmbedding = await toEmbedding(params.data.name)
      const item = await db.dish.create({
        data: { ...params.data, nameEmbedding },
        omit: { nameEmbedding: true },
      })
      if (waitAfterEmbeddingGeneration) await new Promise((r) => setTimeout(r, 1000))
      return item as unknown as Dish
    },

    get: async (params: { id: string }): Promise<Dish> => {
      const item = await db.dish.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      return item as unknown as Dish
    },

    update: async (params: { id: string; data: DishUpdateInput }): Promise<Dish> => {
      const item = await db.dish.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })

      validateSearchMetadata(params.data.searchMetadata as any)

      let data: Prisma.DishUpdateInput = params.data
      if (params.data.name && params.data.name !== item.name) {
        const nameEmbedding = await toEmbedding(params.data.name)
        data = { ...params.data, nameEmbedding }
      }

      const updatedItem = await db.dish.update({
        where: { id: params.id },
        data,
        omit: { nameEmbedding: true },
      })
      return updatedItem as unknown as Dish
    },

    delete: async (params: { id: string }): Promise<Dish> => {
      const item = await db.dish.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      const deletedItem = await db.dish.delete({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      return deletedItem as unknown as Dish
    },
  }
}
