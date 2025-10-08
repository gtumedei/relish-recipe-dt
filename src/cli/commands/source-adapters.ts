import { Command, EnumType } from "@cliffy/command"
import { Spinner } from "@std/cli/unstable-spinner"
import { youtube } from "@relish/source-adapters"
import * as c from "@std/fmt/colors"

const listVideosCommand = new Command()
  .name("list")
  .description("Get a list of videos from YouTube APIs based on a set of criteria.")
  .option("-m, --max-results <value:string>", "The number of videos to return.", { default: "10" })
  .type("order", new EnumType(["date", "rating", "relevance", "title", "viewCount"]))
  .option("-o, --order <value:order>", "How to sort videos.", { default: "relevance" })
  .option("--published-before <value:string>", "Published before the given date (ISO format).")
  .option("--publised-after <value:string>", "Published after the given date (ISO format).")
  .option("--location <value:string>", "Published at the given coordinates.")
  .option("--location-radius <value:string>", "Location radius in km.")
  .option("--language <value:string>", "Video language.")
  .option("--outfile <value:string>", "Path to save the output JSON file.")
  .arguments("<query:string>")
  .action(async ({ outfile, ...youtubeParams }, query) => {
    const spinner = new Spinner({ message: "Fetching video list...", color: "blue" })
    spinner.start()
    const res = await youtube.list({ q: query, ...youtubeParams })
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
  .option("-c, --captions", "Download and save captions.")
  .arguments("<videoUrl:string> <outDir:string>")
  .action(async ({ captions }, videoUrl, outDir) => {
    const spinner = new Spinner({ message: "Downloading video...", color: "blue" })
    spinner.start()
    const res = await youtube.download({
      url: videoUrl,
      outDir,
      withCaptions: captions,
    })
    spinner.stop()
    console.log(`${c.green("✓")} Video downloaded to ${res.videoPath}`)
    if (captions) console.log(`  Captions saved to ${res.captionsPath}`)
  })

const pipelineCommand = new Command()
  .name("pipeline")
  .description("Run the full YouTube video pipeline.")
  .action(async () => {
    await youtube.pipeline()
    console.log(`${c.green("✓")} Done`)
  })

const youtubeCommand = new Command()
  .name("youtube")
  .description("Download food content from YouTube.")
  .action(() => {
    console.log(youtubeCommand.getHelp())
  })
  .command(listVideosCommand.getName(), listVideosCommand)
  .command(downloadVideoCommand.getName(), downloadVideoCommand)
  .command(pipelineCommand.getName(), pipelineCommand)

export const sourceAdaptersCommand = new Command()
  .name("source-adapters")
  .description("Download food content from online sources.")
  .action(() => {
    console.log(sourceAdaptersCommand.getHelp())
  })
  .command(youtubeCommand.getName(), youtubeCommand)
