import { ensureDir } from "@std/fs"
import { z } from "zod"
import { executeCommand } from "./command.ts"
import { openai } from "@ai-sdk/openai"
import { experimental_transcribe as transcribe } from "ai"

const FfprobeDurationSchema = z.object({
  format: z.object({
    duration: z.coerce.number(),
  }),
})

export const getVideoDuration = async (videoPath: string) => {
  const { stdout } = await executeCommand(
    "ffprobe",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    "-v",
    "error",
    videoPath
  )
  try {
    return FfprobeDurationSchema.parse(JSON.parse(stdout)).format.duration
  } catch {
    return null
  }
}

export const extractAudioFromVideo = async (args: {
  inputVideoPath: string
  outputAudioPath: string
}) => {
  "ffmpeg -i input_video.mp4 -q:a 0 -map a output_audio.mp3"
  return await executeCommand(
    "ffmpeg",
    "-i",
    args.inputVideoPath,
    "-q:a",
    "0",
    "-map",
    "a",
    args.outputAudioPath
  )
}

export const extractFramesFromVideo = async (args: {
  videoPath: string
  outDir: string
  fps: number
}) => {
  await ensureDir(args.outDir)
  return await executeCommand(
    "ffmpeg",
    "-i",
    args.videoPath,
    "-vf",
    `fps=${args.fps}`,
    `${args.outDir}/frame-%04d.png`
  )
}

export const vttToJson = (vtt: string) => {
  const blocks = vtt
    .split(/\r?\n\r?\n/)
    .filter((block) => block.match(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/))

  const result: { start: string; end: string; text: string }[] = []
  let lastText = ""

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split(/\r?\n/)
    const timeLine = lines[0]
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/)
    if (!timeMatch || timeMatch.length < 3) continue
    const [_, start, end] = timeMatch

    let text = lines
      .slice(1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!text) continue

    if (lastText.includes(text)) continue
    else {
      // Remove partial overlaps with the previous entry
      for (let j = text.length - 1; j > 0; j--) {
        const s = text.substring(0, j)
        if (lastText.includes(s)) {
          text = text.replace(s, "").trim()
          break
        }
      }
      // Add the new entry
      result.push({ start, end, text })
      lastText = text
    }
  }

  return result
}

const transcriptionModel = openai.transcription("whisper-1")

export const transcribeAudio = async (audioPath: string) => {
  const { text, segments } = await transcribe({
    model: transcriptionModel,
    audio: await Deno.readFile(audioPath),
    providerOptions: {
      openai: {
        responseFormat: "verbose_json",
        timestampGranularities: ["segment"],
      },
    },
  })
  return { text, segments }
}

export const transcribeVideoFrames = () => {}
