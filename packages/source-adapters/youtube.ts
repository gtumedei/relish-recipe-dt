import { env } from "@relish/env"
import { evaluateRecipeLikelihood, extractRecipe } from "@relish/recipe-processing"
import { TMP_DIR } from "@relish/storage"
import { CommandError, executeCommand } from "@relish/utils/command"
import { Requires, resolve } from "@relish/utils/di"
import { tryCatch } from "@relish/utils/try"
import {
  describeVideo,
  describeVideoFrames,
  extractAudioFromVideo,
  extractFramesFromVideo,
  getVideoDuration,
  transcribeAudio,
  vttToJson,
} from "@relish/utils/video"
import { join } from "@std/path"
import dayjs from "dayjs"
import { ExtractedRecipeWithMetadata, SourceAdapter } from "./mod.ts"

// https://developers.google.com/youtube/v3/docs/search/list
const BASE_URL = "https://www.googleapis.com/youtube/v3/search"

// Discard videos that score lower than the recipe likelihood (1-5 scale)
const RECIPE_LIKELIHOOD_THRESHOLD = 3

type YoutubeSearchParameters = {
  key: string
  q: string
  part: "snippet"
  type: "video"
  maxResults: string // 50 max
  order: "date" | "rating" | "relevance" | "title" | "viewCount"
  publishedBefore?: string // e.g.: 1970-01-01T00:00:00Z
  publishedAfter?: string // e.g.: 1970-01-01T00:00:00Z
  location?: string // e.g.: "37.42307,-122.08427"
  locationRadius?: string // 1000km max
  relevanceLanguage?: string // http://www.loc.gov/standards/iso639-2/php/code_list.php
}

/* type PartialYoutubeSearchParameters = Pick<YoutubeSearchParameters, "q"> &
  Partial<YoutubeSearchParameters> */

type YoutubeSearchResult = {
  kind: string
  etag: string
  nextPageToken: string
  regionCode: string
  pageInfo: { totalResults: number; resultsPerPage: number }
  items: YoutubeSearchItem[]
}

type YoutubeSearchItem = {
  kind: string
  etag: string
  id: { kind: "youtube#video"; videoId: string }
  snippet: {
    publishedAt: string // e.g.: 1970-01-01T00:00:00Z
    channelId: string
    title: string
    description: string
    thumbnails: { default: any; medium: any; high: any }
    channelTitle: string
  }
}

const parseVideoUrlOrId = (videoURLOrID: string) => {
  return videoURLOrID.startsWith("http")
    ? { url: videoURLOrID, id: new URL(videoURLOrID).searchParams.get("v")! }
    : { url: `https://youtube.com/watch?v=${videoURLOrID}`, id: videoURLOrID }
}

export type YoutubeSourceAdapter = ReturnType<typeof createYoutubeAdapter>

export function createYoutubeAdapter(this: Requires<"logger">) {
  const { logger } = resolve(this)

  const youtube = {
    findDishSources: async ({ dish }) => {
      // TODO: validate the dish search parameters
      const defaultParams = {
        key: env.YOUTUBE_API_KEY,
        q: "food",
        part: "snippet",
        type: "video",
        maxResults: "3",
        order: "relevance",
        publishedAfter: dayjs().startOf("D").subtract(1, "w").toISOString(), // Fetch videos uploaded in the last week
      } satisfies YoutubeSearchParameters
      const allParams = { ...defaultParams, ...JSON.parse(dish.searchMetadata.youtube ?? "{}") }

      logger.i("Fetching food data from YouTube with the following parameters: ", allParams)
      const url = `${BASE_URL}?${new URLSearchParams(allParams).toString()}`
      const res = await fetch(url)
      const data = ((await res.json()) as YoutubeSearchResult).items.map((it) => ({
        url: parseVideoUrlOrId(it.id.videoId).url,
        ...it,
      }))

      logger.i("Evaluating recipe likelihood for each video")
      const scores: (number | null)[] = []
      for (const item of data) {
        try {
          const score = await evaluateRecipeLikelihood(JSON.stringify(item, null, 2))
          scores.push(score)
          logger.i(`[${item.id.videoId}] Recipe likelihood: ${score}`)
        } catch (e) {
          scores.push(null)
          logger.e(`[${item.id.videoId}] Failed to compute recipe likelihood`, e)
        }
      }

      let items = data.map((item, i) => ({ score: scores[i], metadata: item }))
      const filename = join(TMP_DIR, "youtube-scored-results.json")
      logger.i(`Saving results to ${filename}`)
      await Deno.writeTextFile(filename, JSON.stringify(items, null, 2))

      logger.i(`Discarding videos with likelihood less than ${RECIPE_LIKELIHOOD_THRESHOLD}/5`)
      items = items.filter(
        (item) => item.score !== null && item.score >= RECIPE_LIKELIHOOD_THRESHOLD,
      )

      return data
    },

    processDishFromSource: async ({ source }) => {
      // Parse URL. Hard failure means we can't do anything
      let videoId: string
      try {
        videoId = parseVideoUrlOrId(source.url).id
      } catch (error) {
        logger.e(`[${source.url}] Failed to parse video URL`, error)
        return []
      }

      const videoDir = join(TMP_DIR, videoId)

      // Download video
      const videoPath = await tryCatch(
        youtube.downloadVideo({ videoUrlOrId: videoId, outDir: videoDir }),
      )
      if (!videoPath.ok)
        logger.w(
          `[${videoId}] Failed to download video, will attempt captions-only processing: ${videoPath.error.message}`,
        )

      // Download captions
      const captionsPath = await youtube.downloadVideoCaptions({
        videoUrlOrId: videoId,
        outDir: videoDir,
      })

      let framesDescriptionContent = ""
      let transcriptionContent = ""
      let captionsContent = ""

      // Visual branch (requires video)
      if (videoPath.ok) {
        const duration = await tryCatch(getVideoDuration(videoPath.value))
        if (!duration.ok)
          logger.w(`[${videoId}] Failed to get video duration: ${duration.error.message}`)
        else logger.i(`[${videoId}] Video duration: ${Math.floor(duration.value ?? 0)}s`)

        logger.i(`[${videoId}] Extracting frames...`)
        const framesDir = join(videoDir, "frames")
        const framesRes = await tryCatch(
          extractFramesFromVideo({ videoPath: videoPath.value, outDir: framesDir, fps: 1 }),
        )

        if (!framesRes.ok) {
          logger.w(`[${videoId}] Failed to extract video frames: ${framesRes.error.message}`)
        } else {
          logger.i(`[${videoId}] Describing frames...`)
          const framesDescription = await tryCatch(describeVideoFrames({ framesDir }))
          if (!framesDescription.ok) {
            logger.w(
              `[${videoId}] Failed to describe video frames: ${framesDescription.error.message}`,
            )
          } else {
            framesDescriptionContent = JSON.stringify(framesDescription, null, 2)
            await Deno.writeTextFile(
              join(videoDir, "frames-description.json"),
              framesDescriptionContent,
            ).catch((e) => logger.w(`[${videoId}] Failed to save frames description`, e))
          }
        }
      }

      // Audio branch (requires video)
      if (videoPath.ok) {
        logger.i(`[${videoId}] Extracting audio track...`)
        const audioPath = join(videoDir, "audio.mp3")
        const audioRes = await tryCatch(
          extractAudioFromVideo({ inputVideoPath: videoPath.value, outputAudioPath: audioPath }),
        )
        if (!audioRes.ok) {
          logger.w(`[${videoId}] Failed to extract audio: ${audioRes.error.message}`)
        } else {
          logger.i(`[${videoId}] Transcribing audio track...`)
          const transcriptionRes = await tryCatch(() => transcribeAudio(audioPath))
          if (!transcriptionRes.ok) {
            logger.w(`[${videoId}] Failed to transcribe audio: ${transcriptionRes.error.message}`)
          } else {
            transcriptionContent = JSON.stringify(transcriptionRes.value.segments, null, 2)
            await Deno.writeTextFile(
              join(videoDir, "transcription.json"),
              transcriptionContent,
            ).catch((e) => logger.w(`[${videoId}] Failed to save transcription`, e))
          }
        }
      }

      // Captions branch (independent, no video needed)
      if (captionsPath) {
        const captionsRes = await tryCatch(Deno.readTextFile(captionsPath))
        if (captionsRes.ok) captionsContent = captionsRes.value
        else
          logger.w(`[${videoId}] Failed to read captions from file: ${captionsRes.error.message}`)
      } else {
        logger.w(`[${videoId}] Captions not available`)
      }

      // If all data sources are empty, bail out early
      if (!captionsContent && !transcriptionContent && !framesDescriptionContent) {
        logger.w(
          `[${videoId}] No data sources available (no captions, transcription, or frames). Skipping recipe extraction.`,
        )
        return []
      }

      // Combine all sources into a video description
      logger.i(`[${videoId}] Putting it all together...`)
      const description = await tryCatch(
        describeVideo({
          captions: captionsContent,
          transcription: transcriptionContent,
          description: framesDescriptionContent,
          promptAppendix: `
          Cooking video specialization:
          When generating the description, make sure to include all relevant cooking-related information that appears in the video. This includes:
          - Cooking techniques and methods
          - Ingredients and their quantities
          - Timings, durations, and temperatures
          - Tools, utensils, and equipment used
          - Key visual cues related to food preparation, presentation, or changes in the dish
          `,
        }),
      )

      if (!description.ok) {
        logger.w(`[${videoId}] Failed to generate video description: ${description.error.message}`)
        return []
      } else if (!description.value) {
        logger.w(`[${videoId}] Video description was empty. Skipping recipe extraction.`)
        return []
      }

      await Deno.writeTextFile(join(videoDir, "description.txt"), description.value).catch((e) =>
        logger.w(`[${videoId}] Failed to save description`, e),
      )

      // Extract structured recipe from description
      logger.i(`[${videoId}] Extracting formatted recipe...`)
      const recipe = await tryCatch(extractRecipe(description.value))
      if (!recipe.ok) {
        logger.w(`[${videoId}] Failed to extract recipe: ${recipe.error.message}`)
        return []
      }

      // Fetch additional metadata
      logger.i(`[${videoId}] Fetching detailed metadata...`)
      const metadata = await youtube.fetchDetailedMetadata({ videoUrlOrId: videoId })

      // Assemble final results
      const recipesWithMetadata: ExtractedRecipeWithMetadata[] = recipe.value.result.map(
        (r, i) => ({
          ...r,
          source: source.url,
          index: i,
          language: metadata?.language as string | undefined,
          location: metadata?.location as string | undefined,
          modelConfidence: recipe.value.confidence,
        }),
      )

      await Deno.writeTextFile(
        join(videoDir, "recipe.json"),
        JSON.stringify(recipesWithMetadata, null, 2),
      ).catch((e) => logger.w(`[${videoId}] Failed to save recipe`, e))

      logger.i(`[${videoId}] Extracted ${recipesWithMetadata.length} recipe(s)`)
      return recipesWithMetadata
    },

    downloadVideo: async (params: {
      videoUrlOrId: string
      outDir: string
      withCaptions?: boolean
    }) => {
      const { url } = parseVideoUrlOrId(params.videoUrlOrId)
      const videoPathWithGenericExtension = join(params.outDir, "video.%(ext)s")
      // Download video
      await executeCommand(
        "yt-dlp",
        "-f",
        "bestvideo[height<=480]+bestaudio/best[height<=480]",
        url,
        "-o",
        videoPathWithGenericExtension,
      )
      // Retrieve downloaded file path
      const videoFile = Array.from(Deno.readDirSync(params.outDir)).find(
        (f) => f.isFile && /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name),
      )
      const videoPath = videoFile ? join(params.outDir, videoFile.name) : null
      if (!videoPath) throw new Error("Unable to retrieve the path of the downloaded video")
      return videoPath
    },

    downloadVideoCaptions: async (params: { videoUrlOrId: string; outDir: string }) => {
      const { url } = parseVideoUrlOrId(params.videoUrlOrId)
      try {
        await executeCommand(
          "yt-dlp",
          "--write-auto-sub",
          "--write-sub",
          "--sub-lang",
          "en,original",
          "--skip-download",
          "-P",
          params.outDir,
          url,
        )
      } catch (e) {
        if (e instanceof CommandError) console.error(e, e.stderr)
        else console.error(e)
        return null
      }
      const captionsFile = Array.from(Deno.readDirSync(params.outDir)).find(
        (f) => f.isFile && /\.(vtt)$/i.test(f.name),
      )
      const captionsPath = captionsFile ? join(params.outDir, captionsFile.name) : null
      if (captionsPath) {
        const captions = await Deno.readTextFile(captionsPath)
        const formattedCaptions = vttToJson(captions)
        await Deno.writeTextFile(
          join(params.outDir, "captions.json"),
          JSON.stringify(formattedCaptions, null, 2),
        )
      }
      return captionsPath
    },

    fetchDetailedMetadata: async (params: { videoUrlOrId: string }) => {
      const { url } = parseVideoUrlOrId(params.videoUrlOrId)
      try {
        const out = await executeCommand("yt-dlp", "-j", url)
        const metadata = JSON.parse(out.stdout)
        return metadata
      } catch (e) {
        if (e instanceof CommandError) console.error(e, e.stderr)
        else console.error(e)
        return null
      }
    },
  } satisfies SourceAdapter
  return youtube
}
