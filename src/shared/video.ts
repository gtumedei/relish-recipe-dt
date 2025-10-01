import { executeCommand } from "./command.ts"
import { z } from "zod"

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

export const extractFramesFromVideo = (args: { videoPath: string; outDir: string; fps: number }) =>
  executeCommand(
    "ffmpeg",
    "-i",
    args.videoPath,
    "-vf",
    `fps=${args.fps}`,
    `${args.outDir}/frame-%04d.png`
  )
