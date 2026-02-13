import { db, type $Enums, type ApiKey } from "@relish/storage"
import { nanoid } from "nanoid"
import z from "zod"
import { SdkError } from "~/error.ts"

const CollectionAccessSchema = z.array(
  z.object({
    collection: z.enum(["Dish", "Recipe", "UserRecipe", "Ingredient", "Tool"]),
    rules: z.array(
      z.enum(["CREATE", "READ", "UPDATE", "DELETE", "TASKS"] satisfies $Enums.AccessRule[]),
    ),
  }),
)

export type ProtectedCollection = z.infer<typeof CollectionAccessSchema>[number]["collection"]
export type AccessRule = z.infer<typeof CollectionAccessSchema>[number]["rules"][number]

export const apiKeys = {
  list: async () => {
    const keys = await db.apiKey.findMany()
    return keys
  },
  create: async (params: { data: Pick<ApiKey, "name" | "access"> }) => {
    if (!CollectionAccessSchema.safeParse(params.data.access))
      throw new SdkError({ code: "BAD_REQUEST", message: "Invalid collection access object" })
    const key = await db.apiKey.create({
      data: { key: nanoid(32), ...params.data },
    })
    return key
  },
  get: async (params: { key: string }) => {
    const key = await db.apiKey.findUnique({ where: { key: params.key } })
    if (!key) throw new SdkError({ code: "NOT_FOUND" })
    return key
  },
  update: async (params: { key: string; data: Pick<ApiKey, "name" | "access"> }) => {
    const key = await db.apiKey.findUnique({ where: { key: params.key } })
    if (!key) throw new SdkError({ code: "NOT_FOUND" })
    if (!CollectionAccessSchema.safeParse(params.data.access))
      throw new SdkError({ code: "BAD_REQUEST", message: "Invalid collection access object" })
    const updatedKey = await db.apiKey.update({
      where: { key: params.key },
      data: params.data,
    })
    return updatedKey
  },
  delete: async (params: { key: string }) => {
    const key = await db.apiKey.findUnique({ where: { key: params.key } })
    if (!key) throw new SdkError({ code: "NOT_FOUND" })
    const deletedKey = await db.apiKey.delete({ where: { key: params.key } })
    return deletedKey
  },
}
