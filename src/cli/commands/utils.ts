import { Command } from "@cliffy/command"
import {
  extractAudioFromVideo,
  extractFramesFromVideo,
  getVideoDuration,
  transcribeAudio,
} from "@relish/utils"
import { Spinner } from "@std/cli/unstable-spinner"
import * as c from "@std/fmt/colors"

const getVideoDurationCommand = new Command()
  .name("get-video-duration")
  .description("Get the duration of a video given its path.")
  .arguments("<path:string>")
  .action(async (_, path) => {
    const duration = await getVideoDuration(path)
    console.log(`${c.blue("→")} The video is ${c.brightYellow(`${duration}s`)} long`)
  })

const extractAudioFromVideoCommand = new Command()
  .name("extract-audio")
  .description("Extract and save the audio track of a video.")
  .arguments("<video-path:string> <audio-path:string>")
  .action(async (_, inputVideoPath, outputAudioPath) => {
    const spinner = new Spinner({ message: "Extracting audio...", color: "blue" })
    spinner.start()
    await extractAudioFromVideo({ inputVideoPath, outputAudioPath })
    spinner.stop()
    console.log(`${c.green("✓")} Done`)
  })

const extractVideoFramesCommand = new Command()
  .name("extract-video-frames")
  .description("Extract and save the frames of a video.")
  .option("--fps <value:number>", "How many frames per second to extract.", { default: 1 })
  .arguments("<video-path:string> <outdir:string>")
  .action(async ({ fps }, videoPath, outDir) => {
    const spinner = new Spinner({ message: "Extracting frames...", color: "blue" })
    spinner.start()
    await extractFramesFromVideo({ videoPath, outDir, fps })
    spinner.stop()
    console.log(`${c.green("✓")} Done`)
  })

const transcribeAudioCommand = new Command()
  .name("transcribe-audio")
  .description("Transcribe an audio track.")
  .option("--outtext <value:string>", "Path to save the output transcription as plain text.")
  .option(
    "--outjson <value:string>",
    "Path to save the output transcription as JSON with timestamps."
  )
  .arguments("<audio-path:string>")
  .action(async ({ outtext, outjson }, audioPath) => {
    const spinner = new Spinner({ message: "Transcribing audio...", color: "blue" })
    spinner.start()
    const { text, segments } = await transcribeAudio(audioPath)
    spinner.stop()
    if (outtext) {
      await Deno.writeTextFile(outtext, text)
      console.log(`  Transcription saved as text ${outtext}`)
    }
    if (outjson) {
      await Deno.writeTextFile(outjson, JSON.stringify(segments, null, 2))
      console.log(`  Segments saved as JSON to ${outjson}`)
    }
    if (!outtext && !outjson) console.log(text, "\n")
    console.log(`${c.green("✓")} Done`)
  })

export const utilsCommand = new Command()
  .name("utils")
  .description("Various utility functions.")
  .action(() => {
    console.log(utilsCommand.getHelp())
  })
  .command(getVideoDurationCommand.getName(), getVideoDurationCommand)
  .command(extractAudioFromVideoCommand.getName(), extractAudioFromVideoCommand)
  .command(extractVideoFramesCommand.getName(), extractVideoFramesCommand)
  .command(transcribeAudioCommand.getName(), transcribeAudioCommand)
