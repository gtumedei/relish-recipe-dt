import { Scalar } from "@scalar/hono-api-reference"
import { blue } from "@std/fmt/colors"
import { Hono } from "hono"
import { describeRoute, openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { logger } from "hono/logger"
import { apiKeyAuth } from "~/lib/auth.ts"
import { security, text } from "~/lib/openapi-utils.ts"

const app = new Hono()

app.use(logger())
app.use(cors())

app.use("/api/*", apiKeyAuth)

app.get(
  "/api/key",
  describeRoute({
    tags: ["API key"],
    responses: {
      200: text({ description: "Hello world route" }),
    },
  }),
  (c) => c.json({ key: c.get("apiKey") }),
)

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
  }),
)

app.use("/favicon.webp", serveStatic({ path: "./public/favicon.webp" }))

app.notFound((c) => c.json({ message: "Not found" }, 404))

const msg = `
🍛 Relish server started

   API:   ${blue("http://localhost:8000/api")}
   Docs:  ${blue("http://localhost:8000/scalar")}
`

Deno.serve({ onListen: () => console.log(msg) }, app.fetch)
