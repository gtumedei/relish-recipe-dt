import { OpenAI } from "openai"
import { env } from "@relish/env"
import { openai } from "@ai-sdk/openai"

export const gpt4oMini = openai("gpt-4o-mini")
export const gpt4_1Mini = openai("gpt-4.1")
export const whisper1 = openai.transcription("whisper-1")

export const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export const toEmbedding = async (value: string) => {
  const res = await openaiClient.embeddings.create({
    model: "text-embedding-ada-002",
    input: value,
  })
  return res.data[0].embedding
}
