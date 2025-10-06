import { Command } from "@cliffy/command"
import { getVideoDuration, extractFramesFromVideo } from "@relish/utils"
import * as c from "@std/fmt/colors"
import { Spinner } from "@std/cli/unstable-spinner"

const getVideoDurationCommand = new Command()
  .name("get-video-duration")
  .description("Get the duration of a video given its path.")
  .arguments("<path:string>")
  .action(async (_, path) => {
    const duration = await getVideoDuration(path)
    console.log(`${c.blue("→")} The video is ${c.brightYellow(`${duration}s`)} long`)
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

export const utilsCommand = new Command()
  .name("utils")
  .description("Various utility functions.")
  .action(() => {
    console.log(utilsCommand.getHelp())
  })
  .command(getVideoDurationCommand.getName(), getVideoDurationCommand)
  .command(extractVideoFramesCommand.getName(), extractVideoFramesCommand)
