import { SdkError, toHttpStatus } from "@relish/sdk"
import type { Context } from "hono"
import z from "zod"

export const ObjectIdSchema = z.string().regex(/^[a-fA-F\d]{24}$/i)
export const IdParamSchema = z.object({ id: ObjectIdSchema })

export const ResourceListSchema = <TInput, TOutput>(ItemSchema: z.ZodType<TOutput, TInput>) =>
  z.object({
    items: z.array(ItemSchema),
    page: z.number(),
    pageCount: z.number(),
    totalItemCount: z.number(),
  })

export const PageSchema = z.coerce.number().int().min(1).default(1)
export const SortOrderSchema = z.enum(["asc", "desc"]).default("desc")

export const MediaSchema = z.object({
  url: z.url(),
  type: z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"]),
  description: z.string().optional(),
  createdAt: z.string(),
})

export const MediaWriteSchema = MediaSchema.omit({ createdAt: true })

export const ToolRefSchema = z.object({
  tool: ObjectIdSchema,
  alternatives: z.array(ObjectIdSchema),
})

export const sdkErrorResponse = (c: Context, error: unknown) => {
  if (error instanceof SdkError) {
    return c.json({ error: error.message || error.code }, toHttpStatus(error.code))
  }
  console.error(error)
  return c.json({ error: "Internal server error" }, 500)
}
