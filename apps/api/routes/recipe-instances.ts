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
  ToolRefSchema,
} from "~/lib/route-utils.ts"

const { sdk } = container

const UserIngredientRefSchema = z.object({
  ingredientOrDishId: ObjectIdSchema,
  quantity: z.number().int().nullable().optional(),
  unit: z.string().nullable().optional(),
})

const UserStepSchema = z.object({
  description: z.string(),
  ingredients: z.array(UserIngredientRefSchema),
  tools: z.array(ToolRefSchema),
  prepSeconds: z.number().int().nonnegative().nullable().optional(),
})

const LocationSchema = z.object({
  string: z.string(),
  geonameId: z.string().nullable().optional(),
})

const RecipeInstanceWriteSchema = z.object({
  dishId: ObjectIdSchema,
  ingredients: z.array(UserIngredientRefSchema),
  tools: z.array(ToolRefSchema),
  steps: z.array(UserStepSchema),
  totalPrepSeconds: z.number().int().nonnegative().optional(),
  sourceId: ObjectIdSchema,
  index: z.number().int().nonnegative(),
  modelConfidence: z.number(),
  media: z.array(MediaWriteSchema).optional(),
  location: LocationSchema,
  language: z.string(),
})

const RecipeInstanceSchema = z.object({
  id: ObjectIdSchema,
  dishId: ObjectIdSchema,
  ingredients: z.array(UserIngredientRefSchema),
  tools: z.array(ToolRefSchema),
  steps: z.array(UserStepSchema),
  totalPrepSeconds: z.number().int().nullable(),
  sourceId: ObjectIdSchema,
  index: z.number().int().nonnegative(),
  modelConfidence: z.number(),
  media: z.array(MediaSchema),
  location: LocationSchema,
  language: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const RecipeInstanceListQuerySchema = z
  .object({
    page: PageSchema,
    sort: z.enum(["totalPrepSeconds", "createdAt", "modelConfidence"]).default("createdAt"),
    order: SortOrderSchema,
    dishId: ObjectIdSchema.optional(),
    ingredient: ObjectIdSchema.optional(),
    tool: ObjectIdSchema.optional(),
    totalPrepSecondsMin: z.coerce.number().int().nonnegative().optional(),
    totalPrepSecondsMax: z.coerce.number().int().nonnegative().optional(),
    location: z.string().optional(),
    language: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      typeof data.totalPrepSecondsMin === "number" &&
      typeof data.totalPrepSecondsMax === "number" &&
      data.totalPrepSecondsMin > data.totalPrepSecondsMax
    ) {
      ctx.addIssue({
        code: "custom",
        message: "totalPrepSecondsMin cannot be greater than totalPrepSecondsMax",
        path: ["totalPrepSecondsMin"],
      })
    }
  })

export const recipeInstanceRoutes = new Hono()
  .use(describeRoute({ tags: ["Recipe instances"] }))
  .use(requireCollectionAccess("RecipeInstance"))

  .get(
    "/",
    requireAccessRule("READ"),
    describeRoute({
      responses: {
        200: json({
          description: "Recipe instance list",
          schema: ResourceListSchema(RecipeInstanceSchema),
        }),
        400: validationError,
      },
    }),
    validator("query", RecipeInstanceListQuerySchema),
    async (c) => {
      const query = c.req.valid("query")

      try {
        const list = await sdk.recipeInstances.list({
          page: query.page,
          sort: query.sort,
          order: query.order,
          filter: {
            dishId: query.dishId,
            ingredient: query.ingredient,
            tool: query.tool,
            totalPrepSecondsMin: query.totalPrepSecondsMin,
            totalPrepSecondsMax: query.totalPrepSecondsMax,
            location: query.location,
            language: query.language,
          },
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
        201: json({ description: "Recipe instance", schema: RecipeInstanceSchema }),
        400: validationError,
      },
    }),
    validator("json", RecipeInstanceWriteSchema),
    async (c) => {
      const body = c.req.valid("json")

      try {
        const item = await sdk.recipeInstances.create({ data: body })
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
        200: json({ description: "Recipe instance", schema: RecipeInstanceSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.recipeInstances.get({ id: params.id })
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
        200: json({ description: "Recipe instance", schema: RecipeInstanceSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    validator("json", RecipeInstanceWriteSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      try {
        const item = await sdk.recipeInstances.update({ id: params.id, data: body })
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
        200: json({ description: "Deleted recipe instance", schema: RecipeInstanceSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.recipeInstances.delete({ id: params.id })
        return c.json(item)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )
