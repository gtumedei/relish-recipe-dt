import { Scalar } from "@scalar/hono-api-reference"
import { blue } from "@std/fmt/colors"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { logger } from "hono/logger"
import { container } from "~/api.container.ts"
import { setupCronjobs } from "~/crons.ts"
import { apiKeyAuth } from "~/lib/auth.ts"
import { security } from "~/lib/openapi-utils.ts"
import { apiKeyRoutes } from "~/routes/api-keys.ts"
import { dishRoutes } from "~/routes/dishes.ts"
import { ingredientRoutes } from "~/routes/ingredients.ts"
import { recipeInstanceRoutes } from "~/routes/recipe-instances.ts"
import { recipeRoutes } from "~/routes/recipes.ts"
import { taskRoutes } from "~/routes/tasks.ts"
import { toolRoutes } from "~/routes/tools.ts"
import { queue } from "~/tasks/queue.ts"

const app = new Hono()

app.use(logger())
app.use(cors())

app.get("/", (c) => c.redirect("/scalar"))

app.use("/api/*", apiKeyAuth)

app.route("/api/keys", apiKeyRoutes)
app.route("/api/dishes", dishRoutes)
app.route("/api/recipes", recipeRoutes)
app.route("/api/recipe-instances", recipeInstanceRoutes)
app.route("/api/ingredients", ingredientRoutes)
app.route("/api/tools", toolRoutes)
app.route("/api/tasks", taskRoutes)

app.get(
  "/docs",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "RELISH Recipe Digital Twin",
        version: "0.1.0",
        description: "API server for  the RELISH Recipe Digital Twin.",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
      security: security.bearerAuth,
    },
  }),
)
app.get(
  "/scalar",
  Scalar({
    url: "/docs",
    favicon: "/favicon.webp",
    agent: { disabled: true },
    hideClientButton: true,
    showDeveloperTools: "never",
    persistAuth: true,
  }),
)

app.use("/favicon.webp", serveStatic({ path: "./public/favicon.webp" }))

app.notFound((c) => c.json({ message: "Not found" }, 404))

// TODO: A crash of the web server does not crash workers, so this could theoretically re-queue all jobs even if they are perfectly fine
// Restart unfinished tasks
const { db } = container
const unfinishedTasks = await db.task.findMany({
  where: { status: { in: ["STALLED"] } },
})
if (unfinishedTasks.length > 0) {
  console.log(`🔄 Restarting ${unfinishedTasks.length} unfinished tasks`)
  await db.task.updateMany({
    data: { status: "PENDING" },
    where: { id: { in: unfinishedTasks.map((t) => t.id) } },
  })
  await Promise.all(
    unfinishedTasks.map((task) => queue.add("process", { foo: "bar" }, { jobId: task.id })),
  )
}

// Start the web server
const msg = `
🍛 Relish server started

   API:   ${blue("http://localhost:8000/api")}
   Docs:  ${blue("http://localhost:8000/scalar")}
`
Deno.serve({ onListen: () => console.log(msg) }, app.fetch)

setupCronjobs()
