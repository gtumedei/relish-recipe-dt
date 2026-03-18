import { db } from "@relish/storage"
import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import z from "zod"
import { json, sdkError, validationError } from "~/lib/openapi-utils.ts"
import { IdParamSchema, sdkErrorResponse } from "~/lib/route-utils.ts"
import { pool } from "~/tasks/pool.ts"

export const taskRoutes = new Hono()
  .use(describeRoute({ tags: ["Tasks"] }))

  .get(
    "/",
    describeRoute({
      responses: {
        200: json({ description: "Task list", schema: z.array(z.any()) }),
      },
    }),
    async (c) => {
      try {
        const tasks = await db.task.findMany()
        return c.json(tasks)
      } catch (error) {
        return sdkErrorResponse(c, error)
      }
    },
  )

  .get(
    "/:id",
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
        const parsedLogs = task?.logs.map((entry) => ({
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
    "/sample",
    describeRoute({
      responses: {
        200: json({ description: "Task", schema: z.any() }),
      },
    }),
    async (c) => {
      const task = await db.task.create({
        data: { status: "RUNNING" },
      })
      pool.execute({ taskId: task.id })
      return c.json(task)
    },
  )
