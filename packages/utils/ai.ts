import { openai } from "@ai-sdk/openai"
import { embed } from "ai"

export const gpt4oMini = openai("gpt-4o-mini")
export const gpt4_1Mini = openai("gpt-4.1")
export const whisper1 = openai.transcription("whisper-1")
export const ada002 = openai.embedding("text-embedding-ada-002")

export const toEmbedding = async (value: string) => {
  const res = await embed({ model: ada002, value })
  return res.embedding
}
