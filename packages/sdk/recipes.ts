import { db, type Prisma, type Recipe } from "@relish/storage"
import { SdkError } from "~/error.ts"

export const recipes = {
  list: async () => {
    const items = await db.recipe.findMany()
    return items
  },

  create: async (params: { data: Prisma.RecipeCreateInput }) => {
    const item = await db.recipe.create({ data: params.data })
    return item
  },

  get: async (params: { id: string }) => {
    const item = await db.recipe.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    return item
  },

  update: async (params: { id: string; data: Prisma.RecipeUpdateInput }) => {
    const item = await db.recipe.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const updatedItem = await db.recipe.update({ where: { id: params.id }, data: params.data })
    return updatedItem
  },

  delete: async (params: { id: string }) => {
    const item = await db.recipe.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const deletedItem = await db.recipe.delete({ where: { id: params.id } })
    return deletedItem
  },
}

export type { Recipe }
