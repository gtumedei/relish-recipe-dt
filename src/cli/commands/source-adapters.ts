import { Command, EnumType } from "@cliffy/command"
import { youtube } from "@relish/source-adapters/youtube"
import { Spinner } from "@std/cli/unstable-spinner"
import * as c from "@std/fmt/colors"

const findVideosCommand = new Command()
  .name("find")
  .description("Get a list of videos from YouTube APIs based on a set of criteria.")
  .option("-m, --max-results <value:string>", "The number of videos to return.", { default: "10" })
  .type("order", new EnumType(["date", "rating", "relevance", "title", "viewCount"]))
  .option("-o, --order <value:order>", "How to sort videos.", { default: "relevance" })
  .option("--published-before <value:string>", "Published before the given date (ISO format).")
  .option("--published-after <value:string>", "Published after the given date (ISO format).")
  .option("--location <value:string>", "Published at the given coordinates.")
  .option("--location-radius <value:string>", "Location radius in km.")
  .option("--language <value:string>", "Video language.")
  .option("--outfile <value:string>", "Path to save the output JSON file.")
  .arguments("<query:string>")
  .action(async ({ outfile, ...youtubeParams }, query) => {
    const spinner = new Spinner({ message: "Fetching video list...", color: "blue" })
    spinner.start()
    const res = await youtube.findVideos({ q: query, ...youtubeParams })
    spinner.stop()
    if (outfile) {
      await Deno.writeTextFile(outfile, JSON.stringify(res, null, 2))
      console.log(`${c.green("✓")} Results saved to ${outfile}`)
    } else {
      console.dir(res)
      console.log(`${c.green("✓")} Done`)
    }
  })

const downloadVideoCommand = new Command()
  .name("download")
  .description("Download a video from YouTube.")
  .arguments("<video-url-or-id:string> <out-dir:string>")
  .action(async (_, videoUrlOrId, outDir) => {
    const spinner = new Spinner({ message: "Downloading video...", color: "blue" })
    spinner.start()
    const videoPath = await youtube.downloadVideo({ videoUrlOrId, outDir })
    spinner.stop()
    console.log(`${c.green("✓")} Video downloaded to ${videoPath}`)
  })

const downloadVideoCaptionsCommand = new Command()
  .name("download-captions")
  .description("Download the captions of a video from YouTube.")
  .arguments("<video-url-or-id:string> <out-dir:string>")
  .action(async (_, videoUrlOrId, outDir) => {
    const spinner = new Spinner({ message: "Downloading video captions...", color: "blue" })
    spinner.start()
    const captionsPath = await youtube.downloadVideoCaptions({ videoUrlOrId, outDir })
    spinner.stop()
    console.log(`  Captions saved to ${captionsPath}`)
  })

const fullPipelineCommand = new Command()
  .name("full-pipeline")
  .description("Run the full YouTube video pipeline.")
  .arguments("<search-results-path:string>")
  .action(async (_, searchResultsPath) => {
    const data = JSON.parse(await Deno.readTextFile(searchResultsPath))
    await youtube.executeFullPipeline({ data })
    console.log(`${c.green("✓")} Done`)
  })

const videoPipelineCommand = new Command()
  .name("video-pipeline")
  .description("Run the YouTube pipeline for a single video.")
  .arguments("<video-url-or-id:string>")
  .action(async (_, videoUrlOrId) => {
    await youtube.executeVideoPipeline({ videoUrlOrId })
    console.log(`${c.green("✓")} Done`)
  })

const youtubeCommand = new Command()
  .name("youtube")
  .description("Download food content from YouTube.")
  .action(() => {
    console.log(youtubeCommand.getHelp())
  })
  .command(findVideosCommand.getName(), findVideosCommand)
  .command(downloadVideoCommand.getName(), downloadVideoCommand)
  .command(downloadVideoCaptionsCommand.getName(), downloadVideoCaptionsCommand)
  .command(fullPipelineCommand.getName(), fullPipelineCommand)
  .command(videoPipelineCommand.getName(), videoPipelineCommand)

export const sourceAdaptersCommand = new Command()
  .name("source-adapters")
  .description("Download food content from online sources.")
  .action(() => {
    console.log(sourceAdaptersCommand.getHelp())
  })
  .command(youtubeCommand.getName(), youtubeCommand)
