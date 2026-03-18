import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import z from "zod"
import { container } from "~/api.container.ts"
import { requireAccessRule, requireCollectionAccess } from "~/lib/auth.ts"
import { json, sdkError, validationError } from "~/lib/openapi-utils.ts"
import {
  IdParamSchema,
  MediaSchema,
  MediaWriteSchema,
  ObjectIdSchema,
  PageSchema,
  ResourceListSchema,
  sdkErrorResponse,
  SortOrderSchema,
} from "~/lib/route-utils.ts"

const { sdk } = container

const ToolWriteSchema = z.object({
  name: z.string().min(1),
  media: z.array(MediaWriteSchema).optional(),
})

const ToolSchema = z.object({
  id: ObjectIdSchema,
  name: z.string(),
  nameEmbedding: z.array(z.number()),
  media: z.array(MediaSchema),
  createdAt: z.string(),
})

const ToolListQuerySchema = z.object({
  page: PageSchema,
  sort: z.enum(["createdAt"]).default("createdAt"),
  order: SortOrderSchema,
  name: z.string().optional(),
})

export const toolRoutes = new Hono()
  .use(describeRoute({ tags: ["Tools"] }))
  .use(requireCollectionAccess("Tool"))

  .get(
    "/",
    requireAccessRule("READ"),
    describeRoute({
      responses: {
        200: json({ description: "Tool list", schema: ResourceListSchema(ToolSchema) }),
        400: validationError,
      },
    }),
    validator("query", ToolListQuerySchema),
    async (c) => {
      const query = c.req.valid("query")

      try {
        const list = await sdk.tools.list({
          page: query.page,
          sort: query.sort,
          order: query.order,
          filter: { name: query.name },
        })
        return c.json(list)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )

  .post(
    "/",
    requireAccessRule("CREATE"),
    describeRoute({
      responses: {
        201: json({ description: "Tool", schema: ToolSchema }),
        400: validationError,
      },
    }),
    validator("json", ToolWriteSchema),
    async (c) => {
      const body = c.req.valid("json")

      try {
        const item = await sdk.tools.create({ data: body })
        return c.json(item, 201)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )

  .get(
    "/:id",
    requireAccessRule("READ"),
    describeRoute({
      responses: {
        200: json({ description: "Tool", schema: ToolSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.tools.get({ id: params.id })
        return c.json(item)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )

  .put(
    "/:id",
    requireAccessRule("UPDATE"),
    describeRoute({
      responses: {
        200: json({ description: "Tool", schema: ToolSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    validator("json", ToolWriteSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      try {
        const item = await sdk.tools.update({ id: params.id, data: body })
        return c.json(item)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )

  .delete(
    "/:id",
    requireAccessRule("DELETE"),
    describeRoute({
      responses: {
        200: json({ description: "Deleted tool", schema: ToolSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.tools.delete({ id: params.id })
        return c.json(item)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )
