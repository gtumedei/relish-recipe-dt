import { openai } from "@ai-sdk/openai"
import { ensureDir } from "@std/fs"
import { join } from "@std/path"
import { generateText, experimental_transcribe as transcribe } from "ai"
import sharp from "sharp"
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

const readFrames = async (framesDir: string) => {
  const res = (await Array.fromAsync(Deno.readDir(framesDir))).filter(
    (f) => f.isFile && f.name.startsWith("frame-")
  )
  return res
}

export const extractFramesFromVideo = async (args: {
  videoPath: string
  outDir: string
  fps: number
}) => {
  await ensureDir(args.outDir)
  await executeCommand(
    "ffmpeg",
    "-i",
    args.videoPath,
    "-vf",
    `fps=${args.fps}`,
    `${args.outDir}/frame-%04d.jpeg`
  )
  // Resize images to 1080p if larger than that
  const frames = (await readFrames(args.outDir)).map((f) => join(args.outDir, f.name))
  for (const frame of frames) {
    const image = sharp(frame)
    const metadata = await image.metadata()
    const size =
      metadata.width < 1080
        ? { width: metadata.width, height: metadata.height }
        : { width: 1080, height: (metadata.height * 1080) / metadata.width }
    const data = await image.resize(size.width, size.height).toBuffer()
    await Deno.writeFile(frame, data)
  }
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

const imageDescriptionModel = openai("gpt-4.1-mini")
const imageDescriptionPrompt = `
You are an expert video analysis model.
You will receive a list of still image frames extracted from a video - one frame per second.
Your task is to generate a structured JSON description of the video.

I will provide you with a sequence of image frames, each labeled with a timestamp in seconds (e.g., "frame-0001.png", "frame-0002.png", "frame-0003.png", etc.).
Your goal is to describe the events in the video in a **structured, timestamped JSON array**.

Please follow these rules carefully:

1. Each JSON object represents a segment of time (can be a single second or a short range).
2. Each object must have:
   - \`text\` - a natural-language description of what happens in that time span.
   - \`startSecond\` - the starting timestamp (integer).
   - \`endSecond\` - the ending timestamp (integer).
3. Group consecutive frames together when the same action or scene continues.
4. Use concise, factual language - describe visible people, objects, motion, or scene changes.
5. Output **only valid JSON** - no extra commentary, no Markdown, no explanations. For example:

   \`\`\`json
   [
     {
       "text": "A man sits at a desk typing on a laptop.",
       "startSecond": 0,
       "endSecond": 2
     },
     {
       "text": "He looks up and waves at someone entering the room.",
       "startSecond": 3,
       "endSecond": 5
     }
   ]
   \`\`\`
`

const OutputSchema = z.array(
  z.object({
    startSecond: z.number(),
    endSecond: z.number(),
    text: z.string(),
  })
)

export const describeVideoFrames = async (
  args:
    | { frames: { label: string; image: string | Uint8Array | ArrayBuffer | URL }[] }
    | { framesDir: string }
) => {
  const frames =
    "frames" in args
      ? args.frames
      : await Promise.all(
          (
            await readFrames(args.framesDir)
          ).map(async (f) => ({
            label: f.name,
            image: await Deno.readFile(join(args.framesDir, f.name)),
          }))
        )
  const { text } = await generateText({
    model: imageDescriptionModel,
    system: imageDescriptionPrompt,
    messages: [
      {
        role: "user",
        content: frames.flatMap((frame) => [
          { type: "text", text: frame.label },
          { type: "image", image: frame.image },
        ]),
      },
    ],
  })
  const res = OutputSchema.parse(JSON.parse(text))
  return res
}

const videoDescriptionModel = openai("gpt-4o-mini")
const videoDescriptionPrompt = `
You are an expert media analyst and descriptive writer.
Your task is to produce a **detailed, coherent, and human-readable description** of a video based on three sources of timestamped JSON data:

- **Captions** (text displayed in the video)
- **Audio transcription** (spoken words and sound context)
- **Visual descriptions** (scenes, actions, camera movements, visual elements)

Each source is a JSON array with entries like:

\`\`\`json
[
  { "startSecond": number, "endSecond": number, "text": "string" }
]
\`\`\`

The timestamps are in seconds. Different arrays may have slightly mismatched timing, but they refer to the same video.

Your objective is to:

1. Combine information from all three sources to create a **single, flowing narrative** of the video.
2. Maintain the **temporal sequence** so the narrative follows the video's timeline.
3. Merge overlapping or redundant information smoothly, integrating spoken dialogue, captions, sounds, and visual content.
4. Write in a **descriptive, narrative style** suitable for understanding the video without watching it.
5. Highlight **key actions, locations, transitions, and emotional tone**.
6. If information is missing in a segment, describe what can be inferred or note the absence gracefully.

Output format:

- Plain text (no JSON, no timestamps).
- Produce a single cohesive description of the video from beginning to end.
- Aim for clarity, vividness, and readability.
`

export const describeVideo = async (args: {
  captions: string
  transcription: string
  description: string
}) => {
  const { text } = await generateText({
    model: videoDescriptionModel,
    system: videoDescriptionPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "CAPTIONS" },
          { type: "text", text: args.captions },
          { type: "text", text: "TRANSCRIPTION" },
          { type: "text", text: args.transcription },
          { type: "text", text: "DESCRIPTION" },
          { type: "text", text: args.description },
        ],
      },
    ],
  })
  return text
}
