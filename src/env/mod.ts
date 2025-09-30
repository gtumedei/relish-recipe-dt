import { load } from "@std/dotenv"
import { join } from "@std/path"
import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  YOUTUBE_API_KEY: z.string().min(1),
})

const rawEnv = await load({ envPath: join(import.meta.dirname ?? "./", ".env") })
const parsedEnv = EnvSchema.safeParse(rawEnv)

if (parsedEnv.success === false) {
  console.error(`Invalid environment variables\n${z.prettifyError(parsedEnv.error)}`)
  Deno.exit(1)
}

export const env = parsedEnv.data
