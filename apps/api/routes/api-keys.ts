import { CollectionAccessSchema } from "@relish/sdk"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import z from "zod"
import { json } from "~/lib/openapi-utils.ts"

const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  access: CollectionAccessSchema,
  key: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const apiKeyRoutes = new Hono()
  .use(describeRoute({ tags: ["API keys"] }))

  .get(
    "/",
    describeRoute({
      description: "Provides information about the current API key.",
      responses: {
        200: json({ description: "API key", schema: ApiKeySchema }),
      },
    }),
    (c) => c.json({ key: c.get("apiKey") }),
  )
