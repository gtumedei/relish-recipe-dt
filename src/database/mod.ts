import { env } from "@relish/env"

// @deno-types="./prisma/generated/index.d.ts"
import { PrismaClient } from "./prisma/generated/index.js"

// @deno-types="./prisma/generated/index.d.ts"
export type * from "./prisma/generated/index.js"

export const db = new PrismaClient({
  datasources: {
    db: { url: env.DATABASE_URL },
  },
})
