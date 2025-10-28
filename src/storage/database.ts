import { env } from "@relish/env"

// @deno-types="./generated/index.d.ts"
import { PrismaClient } from "./generated/index.js"

// @deno-types="./generated/index.d.ts"
export type * from "./generated/index.js"

export const db = new PrismaClient({
  datasources: {
    db: { url: env.DATABASE_URL },
  },
})
