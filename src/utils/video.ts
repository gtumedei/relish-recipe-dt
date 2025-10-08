import { ensureDir } from "@std/fs"
import { z } from "zod"
import { executeCommand } from "./command.ts"

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

export const transcribeAudio = () => {}

export const transcribeVideoFrames = () => {}
