import { load } from "@std/dotenv"
import { join } from "@std/path"
import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  MONGOT_PASSWORD: z.string().min(1),
  YOUTUBE_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  GEONAMES_USERNAME: z.string().min(1),
})

await load({ envPath: join(import.meta.dirname!, "../../", ".env"), export: true })
const parsedEnv = EnvSchema.safeParse(Deno.env.toObject())

if (parsedEnv.success === false) {
  console.error(`Invalid environment variables\n${z.prettifyError(parsedEnv.error)}`)
  Deno.exit(1)
}

export const env = parsedEnv.data
