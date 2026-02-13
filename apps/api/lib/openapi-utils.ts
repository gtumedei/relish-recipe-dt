import { resolver } from "hono-openapi"
import z, { ZodType } from "zod"

export const security = {
  none: [{}],
  bearerAuth: [{ bearerAuth: [] }],
}

export const text = (params: { description: string }) => ({
  description: params.description,
  content: { "text/plain": { schema: resolver(z.string()) } },
})

export const json = (params: { description: string; schema: ZodType }) => ({
  description: params.description,
  content: {
    "application/json": { schema: resolver(params.schema) },
  },
})

const PropertyKeySchema = z.union([z.string(), z.number()])

export const ValidatorErrorSchema = z.object({
  data: z.any(),
  error: z.array(
    z.object({
      message: z.string(),
      path: z.array(z.union([PropertyKeySchema, z.object({ key: PropertyKeySchema })])).optional(),
    }),
  ),
})
export type ValidationError = z.infer<typeof ValidatorErrorSchema>

export const validationError = {
  description: "Validation error",
  content: {
    "application/json": { schema: resolver(ValidatorErrorSchema) },
  },
}
