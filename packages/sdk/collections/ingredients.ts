import { Ingredient } from "@relish/sdk"
import { db, Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { SdkError } from "~/error.ts"
import { DEFAULT_PAGE_SIZE, ListResult } from "~/shared.ts"

export type IngredientListParams = {
  pagination: { pageNumber: number; pageSize?: number } | false
  order?: Prisma.SortOrder
  sort?: "createdAt"
  filter?: {
    name?: string
  }
}

export type IngredientSearchParams = {
  query: string
  limit?: number
  minScore?: number
}

export type IngredientSearchResult = {
  ingredient: Ingredient
  score: number
}

export const createIngredientsClient = () => {
  return {
    list: async (params: IngredientListParams): Promise<ListResult<Ingredient>> => {
      const page = params.pagination ? Math.max(1, Math.floor(params.pagination.pageNumber)) : 1
      const pageSize = params.pagination
        ? (params.pagination.pageSize ?? DEFAULT_PAGE_SIZE)
        : undefined
      const order = params.order ?? "desc"

      const where: Prisma.IngredientWhereInput = {}
      if (params.filter?.name?.trim()) {
        where.name = { contains: params.filter.name.trim() }
      }

      const [totalItemCount, items] = await Promise.all([
        db.ingredient.count({ where }),
        db.ingredient.findMany({
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

    search: async (params: IngredientSearchParams): Promise<IngredientSearchResult[]> => {
      if (!params.query.trim())
        throw new SdkError({ code: "BAD_REQUEST", message: "Search query must not be empty" })

      const queryEmbedding = await toEmbedding(params.query.trim())
      const limit = params.limit ?? DEFAULT_PAGE_SIZE

      const res = (await db.ingredient.aggregateRaw({
        pipeline: [
          {
            $vectorSearch: {
              index: "Ingredient_nameEmbedding_vector_index",
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

      const resItems = await db.ingredient.findMany({
        where: { id: { in: res.map((record) => record._id.$oid) } },
        omit: { nameEmbedding: true },
      })

      const results = res
        .map((record) => {
          const item = resItems.find((it) => it.id == record._id.$oid)
          if (!item) return null as unknown as IngredientSearchResult // It's fine since we filter it out right after anyway
          return { ingredient: item, score: record.score }
        })
        .filter((it) => !!it && it.score >= (params.minScore ?? 0))

      return results
    },

    create: async (
      params: { data: Omit<Prisma.IngredientCreateInput, "nameEmbedding"> },
      { waitAfterEmbeddingGeneration = false }: { waitAfterEmbeddingGeneration?: boolean } = {},
    ): Promise<Ingredient> => {
      const nameEmbedding = await toEmbedding(params.data.name)
      const item = await db.ingredient.create({
        data: { ...params.data, nameEmbedding },
        omit: { nameEmbedding: true },
      })
      if (waitAfterEmbeddingGeneration) await new Promise((r) => setTimeout(r, 1000))
      return item
    },

    get: async (params: { id: string }): Promise<Ingredient> => {
      const item = await db.ingredient.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      return item
    },

    update: async (params: {
      id: string
      data: Omit<Prisma.IngredientUpdateInput, "nameEmbedding" | "name"> & {
        name?: string
      }
    }): Promise<Ingredient> => {
      const item = await db.ingredient.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })

      let data: Prisma.IngredientUpdateInput = params.data
      if (params.data.name && params.data.name !== item.name) {
        const nameEmbedding = await toEmbedding(params.data.name)
        data = { ...params.data, nameEmbedding }
      }

      const updatedItem = await db.ingredient.update({
        where: { id: params.id },
        data,
        omit: { nameEmbedding: true },
      })
      return updatedItem
    },

    delete: async (params: { id: string }): Promise<Ingredient> => {
      const item = await db.ingredient.findUnique({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      const deletedItem = await db.ingredient.delete({
        where: { id: params.id },
        omit: { nameEmbedding: true },
      })
      return deletedItem
    },
  }
}
