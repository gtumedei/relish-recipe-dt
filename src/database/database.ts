import { env } from "@relish/env"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema.ts"

export const db = drizzle({
  schema,
  connection: {
    url: env.DATABASE_URL,
  },
})
