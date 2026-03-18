import { cleanupTmpDir } from "@relish/storage"
import { Scalar } from "@scalar/hono-api-reference"
import { blue } from "@std/fmt/colors"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { logger } from "hono/logger"
import { apiKeyAuth } from "~/lib/auth.ts"
import { security } from "~/lib/openapi-utils.ts"
import { apiKeyRoutes } from "~/routes/api-keys.ts"
import { dishRoutes } from "~/routes/dishes.ts"
import { ingredientRoutes } from "~/routes/ingredients.ts"
import { recipeInstanceRoutes } from "~/routes/recipe-instances.ts"
import { recipeRoutes } from "~/routes/recipes.ts"
import { taskRoutes } from "~/routes/tasks.ts"
import { toolRoutes } from "~/routes/tools.ts"
import { pool } from "~/tasks/pool.ts"

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
    showDeveloperTools: "never",
    persistAuth: true,
  }),
)

app.use("/favicon.webp", serveStatic({ path: "./public/favicon.webp" }))

app.notFound((c) => c.json({ message: "Not found" }, 404))

pool.start()

const msg = `
🍛 Relish server started

   API:   ${blue("http://localhost:8000/api")}
   Docs:  ${blue("http://localhost:8000/scalar")}
`

const ac = new AbortController()

Deno.serve({ signal: ac.signal, onListen: () => console.log(msg) }, app.fetch)

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  console.log("Shutting down Hono server...")
  ac.abort()
  console.log("Terminating worker pool...")
  await pool.destroy()
  Deno.exit(0)
}
Deno.addSignalListener("SIGINT", shutdown)
Deno.addSignalListener("SIGTERM", shutdown)

// Every day at 00:00, cleanup temporary files and folders older than 1 week.
Deno.cron("Temporary files cleanup", "0 0 * * *", async () => {
  await cleanupTmpDir({})
})
