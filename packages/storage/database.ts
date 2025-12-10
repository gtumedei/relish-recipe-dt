import { env } from "@relish/env"

// @deno-types="./generated/prisma/client/index.d.ts"
import { PrismaClient } from "./generated/prisma/client/index.js"

// @deno-types="./generated/prisma/client/index.d.ts"
export type * from "./generated/prisma/client/index.js"

export const db = new PrismaClient({
  datasources: {
    db: { url: env.DATABASE_URL },
  },
})
