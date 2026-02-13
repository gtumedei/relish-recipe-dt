import { db, type Prisma, type RecipeInstance } from "@relish/storage"
import { SdkError } from "~/error.ts"

export const recipeInstances = {
  list: async () => {
    const items = await db.recipeInstance.findMany()
    return items
  },

  create: async (params: { data: Prisma.RecipeInstanceCreateInput }) => {
    const item = await db.recipeInstance.create({ data: params.data })
    return item
  },

  get: async (params: { id: string }) => {
    const item = await db.recipeInstance.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    return item
  },

  update: async (params: { id: string; data: Prisma.RecipeInstanceUpdateInput }) => {
    const item = await db.recipeInstance.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const updatedItem = await db.recipeInstance.update({
      where: { id: params.id },
      data: params.data,
    })
    return updatedItem
  },

  delete: async (params: { id: string }) => {
    const item = await db.recipeInstance.findUnique({ where: { id: params.id } })
    if (!item) throw new SdkError({ code: "NOT_FOUND" })
    const deletedItem = await db.recipeInstance.delete({ where: { id: params.id } })
    return deletedItem
  },
}

export type { RecipeInstance }
