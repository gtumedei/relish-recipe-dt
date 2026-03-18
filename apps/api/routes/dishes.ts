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

const SearchMetadataSchema = z.object({
  youtube: z.string().optional(),
})

const DishWriteSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  searchMetadata: SearchMetadataSchema,
  media: z.array(MediaWriteSchema).optional(),
})

const DishSchema = z.object({
  id: ObjectIdSchema,
  name: z.string(),
  nameEmbedding: z.array(z.number()),
  description: z.string(),
  media: z.array(MediaSchema),
  searchMetadata: SearchMetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const dishRoutes = new Hono()
  .use(describeRoute({ tags: ["Dishes"] }))
  .use(requireCollectionAccess("Dish"))

  .get(
    "/",
    requireAccessRule("READ"),
    describeRoute({
      responses: {
        200: json({ description: "Dish list", schema: ResourceListSchema(DishSchema) }),
        400: validationError,
      },
    }),
    validator(
      "query",
      z.object({
        page: PageSchema,
        sort: z.enum(["name", "createdAt"]).default("createdAt"),
        order: SortOrderSchema,
        name: z.string().optional(),
      }),
    ),
    async (c) => {
      const query = c.req.valid("query")
      try {
        const list = await sdk.dishes.list({
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
        201: json({ description: "Dish", schema: DishSchema }),
        400: validationError,
      },
    }),
    validator("json", DishWriteSchema),
    async (c) => {
      const body = c.req.valid("json")
      try {
        const item = await sdk.dishes.create({ data: body })
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
        200: json({ description: "Dish", schema: DishSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")
      try {
        const item = await sdk.dishes.get({ id: params.id })
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
        200: json({ description: "Dish", schema: DishSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    validator("json", DishWriteSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")
      try {
        const item = await sdk.dishes.update({ id: params.id, data: body })
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
        200: json({ description: "Deleted dish", schema: DishSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.dishes.delete({ id: params.id })
        return c.json(item)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )
