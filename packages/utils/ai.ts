import { OpenAI } from "openai"
import { env } from "@relish/env"

export const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export const toEmbedding = async (value: string) => {
  const res = await openaiClient.embeddings.create({
    model: "text-embedding-ada-002",
    input: value,
  })
  return res.data[0].embedding
}
