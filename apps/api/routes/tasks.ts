import { db } from "@relish/storage"
import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import z from "zod"
import { requireAccessRule, requireCollectionAccess } from "~/lib/auth.ts"
import { json, sdkError, validationError } from "~/lib/openapi-utils.ts"
import { IdParamSchema, ObjectIdSchema, sdkErrorResponse } from "~/lib/route-utils.ts"
import { enqueueJob } from "~/tasks/queue.ts"

export const taskRoutes = () =>
  new Hono()
    .use(describeRoute({ tags: ["Tasks"] }))
    .use(requireCollectionAccess("Task"))

    .get(
      "/",
      requireAccessRule("READ"),
      describeRoute({
        responses: {
          200: json({ description: "Task list", schema: z.array(z.any()) }),
        },
      }),
      async (c) => {
        try {
          const tasks = await db.task.findMany({
            orderBy: { createdAt: "desc" },
          })
          return c.json(tasks)
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
          200: json({ description: "Task", schema: z.any() }),
          400: validationError,
          404: sdkError,
        },
      }),
      validator("param", IdParamSchema),
      async (c) => {
        const params = c.req.valid("param")

        try {
          const task = await db.task.findUnique({ where: { id: params.id } })
          const logs = await db.taskLog.findMany({
            where: { taskId: params.id },
            orderBy: { timestamp: "asc" },
          })
          const parsedLogs = logs.map((entry) => ({
            ...entry,
            payload: entry.payload.map((it) => JSON.parse(it)),
          }))
          return c.json({ ...task, logs: parsedLogs })
        } catch (error) {
          return sdkErrorResponse(c, error)
        }
      },
    )

    .post(
      "/dishes/process",
      requireAccessRule("CREATE"),
      describeRoute({
        responses: {
          202: json({ description: "Task enqueued", schema: z.any() }),
        },
      }),
      async (c) => {
        try {
          const task = await enqueueJob({ type: "processAllDishes" })
          return c.json(task, 202)
        } catch (error) {
          return sdkErrorResponse(c, error)
        }
      },
    )

    .post(
      "/dishes/:dishId/process",
      requireAccessRule("CREATE"),
      describeRoute({
        responses: {
          202: json({ description: "Task enqueued", schema: z.any() }),
          400: validationError,
          404: sdkError,
        },
      }),
      validator("param", z.object({ dishId: ObjectIdSchema })),
      async (c) => {
        const { dishId } = c.req.valid("param")
        try {
          const task = await enqueueJob({ type: "processDish", dishId })
          return c.json(task, 202)
        } catch (error) {
          return sdkErrorResponse(c, error)
        }
      },
    )

    .post(
      "/dishes/:dishId/process/:sourceUrl",
      requireAccessRule("CREATE"),
      describeRoute({
        responses: {
          202: json({ description: "Task enqueued", schema: z.any() }),
          400: validationError,
          404: sdkError,
        },
      }),
      validator("param", z.object({ dishId: ObjectIdSchema, sourceUrl: z.string() })),
      validator("query", z.object({ adapter: z.string() })),
      async (c) => {
        const { dishId, sourceUrl } = c.req.valid("param")
        const { adapter } = c.req.valid("query")
        try {
          const decodedSourceUrl = decodeURIComponent(sourceUrl)
          const task = await enqueueJob({
            type: "processDishFromSource",
            dishId,
            adapter,
            sourceUrl: decodedSourceUrl,
          })
          return c.json(task, 202)
        } catch (error) {
          return sdkErrorResponse(c, error)
        }
      },
    )
