import { Ingredient, Prisma } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import { Requires, resolve } from "@relish/utils/di"
import { SdkError } from "~/error.ts"
import { ListResult, DEFAULT_PAGE_SIZE } from "~/shared.ts"

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

export function createIngredientsClient(this: Requires<"db">) {
  const { db } = resolve(this)

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

      const res = await db.ingredient.aggregateRaw({
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
              name: 1,
              media: 1,
              createdAt: 1,
              updatedAt: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ],
      })

      if (!Array.isArray(res)) return []

      let results = res.map((item: any) => ({
        ingredient: {
          id: item._id?.$oid ?? item._id,
          name: item.name,
          media: item.media ?? [],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        } as Ingredient,
        score: item.score,
      }))

      if (params.minScore != null) {
        results = results.filter((r) => r.score >= params.minScore!)
      }

      return results
    },

    create: async (params: { data: Omit<Prisma.IngredientCreateInput, "nameEmbedding"> }) => {
      const nameEmbedding = await toEmbedding(params.data.name)
      const item = await db.ingredient.create({ data: { ...params.data, nameEmbedding } })
      return item
    },

    get: async (params: { id: string }) => {
      const item = await db.ingredient.findUnique({ where: { id: params.id } })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      return item
    },

    update: async (params: {
      id: string
      data: Omit<Prisma.IngredientUpdateInput, "nameEmbedding" | "name"> & {
        name?: string
      }
    }) => {
      const item = await db.ingredient.findUnique({ where: { id: params.id } })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })

      let data: Prisma.IngredientUpdateInput = params.data
      if (params.data.name && params.data.name !== item.name) {
        const nameEmbedding = await toEmbedding(params.data.name)
        data = { ...params.data, nameEmbedding }
      }

      const updatedItem = await db.ingredient.update({ where: { id: params.id }, data })
      return updatedItem
    },

    delete: async (params: { id: string }) => {
      const item = await db.ingredient.findUnique({ where: { id: params.id } })
      if (!item) throw new SdkError({ code: "NOT_FOUND" })
      const deletedItem = await db.ingredient.delete({ where: { id: params.id } })
      return deletedItem
    },
  }
}
