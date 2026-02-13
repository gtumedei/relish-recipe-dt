import { db, type ApiKey } from "@relish/storage"
import { SdkError } from "~/error.ts"

export const apiKeys = {
  list: async () => {
    const keys = await db.apiKey.findMany()
    return keys
  },
  create: async () => {},
  get: async (params: { id: string }) => {
    const key = await db.apiKey.findUnique({ where: { id: params.id } })
    if (!key) throw new SdkError({ code: "NOT_FOUND" })
    return key
  },
  update: async (params: { id: string; data: Pick<ApiKey, "name" | "access"> }) => {
    const key = await db.apiKey.findUnique({ where: { id: params.id } })
    if (!key) throw new SdkError({ code: "NOT_FOUND" })
    await db.apiKey.update({
      where: { id: params.id },
      data: params.data,
    })
  },
  delete: async (params: { id: string }) => {
    const key = await db.apiKey.findUnique({ where: { id: params.id } })
    if (!key) throw new SdkError({ code: "NOT_FOUND" })
    await db.apiKey.delete({ where: { id: params.id } })
  },
}
