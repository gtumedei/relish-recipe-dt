import { Command } from "@cliffy/command"
import { Spinner } from "@std/cli/unstable-spinner"
import * as c from "@std/fmt/colors"
import { container } from "~/cli.container.ts"

const {
  sdk,
  adapters: { youtube },
} = container

const findDishSourcesCommand = new Command()
  .name("find-sources")
  .description("Find YouTube video sources for a given dish.")
  .option("--outfile <value:string>", "Path to save the output JSON file.")
  .arguments("<dish-id:string>")
  .action(async ({ outfile }, dishId) => {
    console.log(`Searching YouTube for dish ${dishId}...`)
    const dish = await sdk.dishes.get({ id: dishId })
    const sources = await youtube.findDishSources({ dish })
    if (outfile) {
      await Deno.writeTextFile(outfile, JSON.stringify(sources, null, 2))
      console.log(`${c.green("✓")} Results saved to ${outfile}`)
    } else {
      console.dir(sources)
      console.log(`${c.green("✓")} Done`)
    }
  })

const processDishFromSourceCommand = new Command()
  .name("process-source")
  .description("Process a YouTube video source and extract recipes for a given dish.")
  .option("--outfile <value:string>", "Path to save the output JSON file.")
  .arguments("<dish-id:string> <source-url:string>")
  .action(async ({ outfile }, dishId, sourceUrl) => {
    console.log(`Processing ${sourceUrl}...`)
    const dish = await sdk.dishes.get({ id: dishId })
    const recipes = await youtube.processDishFromSource({ dish, source: { url: sourceUrl } })
    if (outfile) {
      await Deno.writeTextFile(outfile, JSON.stringify(recipes, null, 2))
      console.log(`${c.green("✓")} Recipes saved to ${outfile}`)
    } else {
      console.dir(recipes, { depth: null })
      console.log(`${c.green("✓")} Done`)
    }
  })

const downloadVideoCommand = new Command()
  .name("download")
  .description("Download a video from YouTube.")
  .arguments("<video-url:string> <out-dir:string>")
  .action(async (_, videoUrl, outDir) => {
    const spinner = new Spinner({ message: "Downloading video...", color: "blue" })
    spinner.start()
    const videoPath = await youtube.downloadVideo({ videoUrlOrId: videoUrl, outDir })
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

const fetchDetailedMetadataCommand = new Command()
  .name("fetch-detailed-metadata")
  .description("Output the detailed metadata of a video from YouTube.")
  .arguments("<video-url-or-id:string>")
  .action(async (_, videoUrlOrId) => {
    const spinner = new Spinner({ message: "Fetching metadata...", color: "blue" })
    spinner.start()
    const metadata = await youtube.fetchDetailedMetadata({ videoUrlOrId })
    spinner.stop()
    console.log(JSON.stringify(metadata, null, 2))
  })

/* const fullPipelineCommand = new Command()
  .name("full-pipeline")
  .description("Run the full YouTube video pipeline.")
  .arguments("<search-results-path:string>")
  .action(async (_, searchResultsPath) => {
    const data = JSON.parse(await Deno.readTextFile(searchResultsPath))
    await youtube.executeFullPipeline({ data })
    console.log(`${c.green("✓")} Done`)
  }) */

/* const videoPipelineCommand = new Command()
  .name("video-pipeline")
  .description("Run the YouTube pipeline for a single video.")
  .arguments("<video-url-or-id:string>")
  .action(async (_, videoUrlOrId) => {
    await youtube.executeVideoPipeline({ videoUrlOrId })
    console.log(`${c.green("✓")} Done`)
  }) */

export const youtubeCommand = new Command()
  .name("youtube")
  .description("Download food content from YouTube.")
  .action(() => {
    console.log(youtubeCommand.getHelp())
  })
  // .command(findVideosCommand.getName(), findVideosCommand)
  .command(findDishSourcesCommand.getName(), findDishSourcesCommand)
  .command(processDishFromSourceCommand.getName(), processDishFromSourceCommand)
  .command(downloadVideoCommand.getName(), downloadVideoCommand)
  .command(downloadVideoCaptionsCommand.getName(), downloadVideoCaptionsCommand)
  .command(fetchDetailedMetadataCommand.getName(), fetchDetailedMetadataCommand)
// .command(fullPipelineCommand.getName(), fullPipelineCommand)
// .command(videoPipelineCommand.getName(), videoPipelineCommand)
