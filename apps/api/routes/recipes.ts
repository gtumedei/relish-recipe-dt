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

const IngredientRefSchema = z.object({
  ingredientOrDishId: ObjectIdSchema,
  quantity: z.number().int(),
  unit: z.string(),
})

const StepSchema = z.object({
  description: z.string(),
  ingredients: z.array(IngredientRefSchema),
  tools: z.array(ToolRefSchema),
  prepSeconds: z.number().int().nonnegative(),
})

const RecipeWriteSchema = z.object({
  dishId: ObjectIdSchema,
  ingredients: z.array(IngredientRefSchema),
  tools: z.array(ToolRefSchema),
  steps: z.array(StepSchema),
  totalPrepSeconds: z.number().int().nonnegative(),
  media: z.array(MediaWriteSchema).optional(),
})

const RecipeSchema = z.object({
  id: ObjectIdSchema,
  dishId: ObjectIdSchema,
  ingredients: z.array(IngredientRefSchema),
  tools: z.array(ToolRefSchema),
  steps: z.array(StepSchema),
  totalPrepSeconds: z.number().int().nonnegative(),
  media: z.array(MediaSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const RecipeListQuerySchema = z
  .object({
    page: PageSchema,
    sort: z.enum(["totalPrepSeconds", "createdAt"]).default("createdAt"),
    order: SortOrderSchema,
    dishId: ObjectIdSchema.optional(),
    ingredient: ObjectIdSchema.optional(),
    tool: ObjectIdSchema.optional(),
    totalPrepSecondsMin: z.coerce.number().int().nonnegative().optional(),
    totalPrepSecondsMax: z.coerce.number().int().nonnegative().optional(),
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

export const recipeRoutes = new Hono()
  .use(describeRoute({ tags: ["Recipes"] }))
  .use(requireCollectionAccess("Recipe"))

  .get(
    "/",
    requireAccessRule("READ"),
    describeRoute({
      responses: {
        200: json({ description: "Recipe list", schema: ResourceListSchema(RecipeSchema) }),
        400: validationError,
      },
    }),
    validator("query", RecipeListQuerySchema),
    async (c) => {
      const query = c.req.valid("query")

      try {
        const list = await sdk.recipes.list({
          page: query.page,
          sort: query.sort,
          order: query.order,
          filter: {
            dishId: query.dishId,
            ingredient: query.ingredient,
            tool: query.tool,
            totalPrepSecondsMin: query.totalPrepSecondsMin,
            totalPrepSecondsMax: query.totalPrepSecondsMax,
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
        201: json({ description: "Recipe", schema: RecipeSchema }),
        400: validationError,
      },
    }),
    validator("json", RecipeWriteSchema),
    async (c) => {
      const body = c.req.valid("json")

      try {
        const item = await sdk.recipes.create({ data: body })
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
        200: json({ description: "Recipe", schema: RecipeSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.recipes.get({ id: params.id })
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
        200: json({ description: "Recipe", schema: RecipeSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    validator("json", RecipeWriteSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      try {
        const item = await sdk.recipes.update({ id: params.id, data: body })
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
        200: json({ description: "Deleted recipe", schema: RecipeSchema }),
        400: validationError,
        404: sdkError,
      },
    }),
    validator("param", IdParamSchema),
    async (c) => {
      const params = c.req.valid("param")

      try {
        const item = await sdk.recipes.delete({ id: params.id })
        return c.json(item)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )
