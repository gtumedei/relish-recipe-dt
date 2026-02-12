import { Command } from "@cliffy/command"
import { db } from "@relish/storage"
import { toEmbedding } from "@relish/utils/ai"
import {
  describeVideo,
  describeVideoFrames,
  extractAudioFromVideo,
  extractFramesFromVideo,
  getVideoDuration,
  transcribeAudio,
} from "@relish/utils/video"
import { Spinner } from "@std/cli/unstable-spinner"
import * as c from "@std/fmt/colors"

const getVideoDurationCommand = new Command()
  .name("get-duration")
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
  .name("extract-frames")
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
  .option("--outtext <value:string>", "Path to save the output transcription as plaintext.")
  .option(
    "--outjson <value:string>",
    "Path to save the output transcription as JSON with timestamps.",
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

const describeVideoFramesCommand = new Command()
  .name("describe-frames")
  .description(
    "Describe a video based on its frames. The framesdir argument must point to a directory containing one image for each frame, with the name frame-XXXX.png, where XXXX is the second corresponding to the frame.",
  )
  .option(
    "-o --outfile <value:string>",
    "Path to save the output description as JSON with timestamps.",
  )
  .arguments("<framesdir:string>")
  .action(async ({ outfile }, framesDir) => {
    const spinner = new Spinner({ message: "Describing video...", color: "blue" })
    spinner.start()
    const res = await describeVideoFrames({ framesDir })
    spinner.stop()
    if (outfile) {
      await Deno.writeTextFile(outfile, JSON.stringify(res, null, 2))
      console.log(`${c.green("✓")} Results saved to ${outfile}`)
    } else {
      console.dir(res)
      console.log(`${c.green("✓")} Done`)
    }
  })

const describeVideoCommand = new Command()
  .name("describe-video")
  .description(
    "Produce an accurate video description based on its captions, audio transcription and visual frames description.",
  )
  .option("-o --outfile <value:string>", "Path to save the output description as plaintext.")
  .arguments("<captions-file:string> <transcription-file:string> <description-file:string>")
  .action(async ({ outfile }, captionsFile, transcriptionFile, descriptionFile) => {
    const spinner = new Spinner({ message: "Describing video...", color: "blue" })
    spinner.start()
    const description = await describeVideo({
      captions: await Deno.readTextFile(captionsFile),
      transcription: await Deno.readTextFile(transcriptionFile),
      description: await Deno.readTextFile(descriptionFile),
    })
    spinner.stop()
    if (outfile) {
      await Deno.writeTextFile(outfile, description)
      console.log(`${c.green("✓")} Result saved to ${outfile}`)
    } else {
      console.dir(description)
      console.log(`${c.green("✓")} Done`)
    }
  })

const videoCommand = new Command()
  .name("video")
  .description("Utilities to work with videos.")
  .action(() => {
    console.log(videoCommand.getHelp())
  })
  .command(getVideoDurationCommand.getName(), getVideoDurationCommand)
  .command(extractAudioFromVideoCommand.getName(), extractAudioFromVideoCommand)
  .command(extractVideoFramesCommand.getName(), extractVideoFramesCommand)
  .command(transcribeAudioCommand.getName(), transcribeAudioCommand)
  .command(describeVideoFramesCommand.getName(), describeVideoFramesCommand)
  .command(describeVideoCommand.getName(), describeVideoCommand)

const healthcheckCommand = new Command()
  .name("healthcheck")
  .description("Check the health status of the system")
  .option("-s, --semantic-search", "Test semantic search.", { default: false })
  .action(async ({ semanticSearch }) => {
    // Check database connection
    let ingredients: any[] = []
    try {
      ingredients = await db.ingredient.findMany({ take: 10 })
      console.log(
        `${c.green("✓")} Database healthy (fetched ${ingredients.length} sample ingredients)`,
      )
    } catch (e) {
      console.error(`${c.red("x")} Database healthcheck failed with the following error:\n`)
      console.error(e)
    }
    // Insert a sample ingredient if the collection is empty
    if (semanticSearch) {
      let ingredientId: string | null = null
      try {
        if (ingredients.length == 0) {
          const ingredientName = "tomato"
          ingredientId = (
            await db.ingredient.create({
              data: {
                name: ingredientName,
                nameEmbedding: await toEmbedding(ingredientName),
              },
            })
          ).id
          console.log(c.gray("  Inserted sample ingredient"))
          console.log(c.gray("  Waiting 2000ms for the document to be available for vector search"))
          await new Promise((r) => setTimeout(r, 2000))
        }
        // Test semantic search
        const res = await db.ingredient.aggregateRaw({
          pipeline: [
            {
              $vectorSearch: {
                index: "Ingredient_nameEmbedding_vector_index",
                path: "nameEmbedding",
                queryVector: await toEmbedding("pomodoro"),
                numCandidates: 200,
                limit: 5,
              },
            },
            {
              $project: {
                name: 1,
                score: { $meta: "vectorSearchScore" },
              },
            },
          ],
        })
        if (!Array.isArray(res) || res.length == 0) throw new Error("No ingredients found")
        console.log(
          `${c.green("✓")} Semantic search healthy (searched for "pomodoro" and got "${res[0].name}" with a score of ${res[0].score})`,
        )
      } catch (e) {
        console.error(`${c.red("x")} Semantic search failed with the following error:\n`)
        console.error(e)
      } finally {
        // Delete sample ingredient
        if (ingredientId !== null) {
          await db.ingredient.delete({ where: { id: ingredientId } })
          console.log(c.gray("  Deleted sample ingredient"))
        }
      }
    }
  })

export const utilsCommand = new Command()
  .name("utils")
  .description("Various utility functions.")
  .action(() => {
    console.log(utilsCommand.getHelp())
  })
  .command(videoCommand.getName(), videoCommand)
  .command(healthcheckCommand.getName(), healthcheckCommand)
