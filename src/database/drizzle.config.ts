import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: Deno.env.get("DATABASE_URL") ?? "",
  },
})
