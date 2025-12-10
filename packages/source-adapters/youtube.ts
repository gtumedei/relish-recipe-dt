import { env } from "@relish/env"
import { evaluateRecipeLikelihood, extractRecipe } from "@relish/recipe-processing"
import { tmpDir } from "@relish/storage"
import { CommandError, executeCommand } from "@relish/utils/command"
import { logger } from "@relish/utils/logger"
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
import type { ExtractedRecipeWithMetadata } from "./mod.ts"

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

export const parseVideoUrlOrId = (videoURLOrID: string) => {
  return videoURLOrID.startsWith("http")
    ? { url: videoURLOrID, id: new URL(videoURLOrID).searchParams.get("v")! }
    : { url: `https://youtube.com/watch?v=${videoURLOrID}`, id: videoURLOrID }
}

export const youtube = {
  executeFullPipeline: async (
    params:
      | { data: YoutubeSearchResult }
      | (Pick<YoutubeSearchParameters, "q"> & Partial<YoutubeSearchParameters>)
  ) => {
    const data =
      "data" in params ? params.data : await youtube.findVideos({ q: "food", maxResults: "1" })
    logger.i(
      `Food data fetched, ${data.items.length} records returned (${data.pageInfo.totalResults} total)`
    )

    logger.i("Evaluating recipe likelihood for each video")
    const scores: (number | null)[] = []
    for (const item of data.items) {
      try {
        const score = await evaluateRecipeLikelihood(JSON.stringify(item, null, 2))
        scores.push(score)
        logger.i(`[${item.id.videoId}] Recipe likelihood: ${score}`)
      } catch (e) {
        scores.push(null)
        logger.e(`[${item.id.videoId}] Failed to compute recipe likelihood`, e)
      }
    }

    let items = data.items.map((item, i) => ({ score: scores[i], metadata: item }))
    const filename = join(tmpDir, "youtube-scored-results.json")
    logger.i(`Saving results to ${filename}`)
    await Deno.writeTextFile(filename, JSON.stringify(items, null, 2))

    logger.i(`Discarding videos with likelihood less than ${RECIPE_LIKELIHOOD_THRESHOLD}/5`)
    items = items.filter((item) => item.score !== null && item.score >= RECIPE_LIKELIHOOD_THRESHOLD)

    logger.i("Downloading selected videos for further processing")
    const recipes: ExtractedRecipeWithMetadata[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      try {
        const recipes = await youtube.executeVideoPipeline({
          videoUrlOrId: item.metadata.id.videoId,
        })
        recipes.push(
          ...recipes.map(
            (r) =>
              ({
                source: item.metadata.id.videoId,
                index: i,
                ...r,
              } satisfies ExtractedRecipeWithMetadata)
          )
        )
      } catch (e) {
        if (e instanceof CommandError) {
          logger.e(e.stdout)
          logger.e(e.stderr)
        } else {
          logger.e(e)
        }
      }
    }
    return recipes
  },

  findVideos: async (
    params: Pick<YoutubeSearchParameters, "q"> & Partial<YoutubeSearchParameters>
  ) => {
    const defaultParams = {
      key: env.YOUTUBE_API_KEY,
      q: "food",
      part: "snippet",
      type: "video",
      maxResults: "3",
      order: "relevance",
      publishedAfter: dayjs().startOf("D").subtract(1, "w").toISOString(), // Fetch videos uploaded in the last week
    } satisfies YoutubeSearchParameters
    const allParams = { ...defaultParams, ...params }
    logger.i("Fetching food data from YouTube with the following parameters: ", allParams)
    const url = `${BASE_URL}?${new URLSearchParams(allParams).toString()}`
    const res = await fetch(url)
    const data = (await res.json()) as YoutubeSearchResult
    return data
  },

  executeVideoPipeline: async ({ videoUrlOrId }: { videoUrlOrId: string }) => {
    const { id: videoId } = parseVideoUrlOrId(videoUrlOrId)

    logger.i(`[${videoId}] Downloading video...`)
    const videoDir = join(tmpDir, videoId)
    const videoPath = await youtube.downloadVideo({ videoUrlOrId, outDir: videoDir })
    const captionsPath = await youtube.downloadVideoCaptions({ videoUrlOrId, outDir: videoDir })

    logger.i(`[${videoId}] Getting video metadata...`)
    const duration = await getVideoDuration(videoPath)

    logger.i(`[${videoId}] Extracting ${Math.floor(duration ?? 0)} frames...`)
    const framesDir = join(videoDir, "frames")
    await extractFramesFromVideo({ videoPath, outDir: framesDir, fps: 1 })

    logger.i(`[${videoId}] Describing frames...`)
    const framesDescription = await describeVideoFrames({ framesDir })
    const framesDescriptionString = JSON.stringify(framesDescription, null, 2)
    const framesDescriptionPath = join(videoDir, "frames-description.json")
    await Deno.writeTextFile(framesDescriptionPath, framesDescriptionString)

    logger.i(`[${videoId}] Extracting audio track...`)
    const audioPath = join(videoDir, "audio.mp3")
    await extractAudioFromVideo({ inputVideoPath: videoPath, outputAudioPath: audioPath })

    logger.i(`[${videoId}] Transcribing audio track...`)
    const { segments } = await transcribeAudio(audioPath)
    const audioTranscriptionString = JSON.stringify(segments, null, 2)
    const transcriptionPath = join(videoDir, "transcription.json")
    await Deno.writeTextFile(transcriptionPath, audioTranscriptionString)

    logger.i(`[${videoId}] Putting it all together...`)
    if (!captionsPath) logger.w(`[${videoId}] Captions not available`)
    const description = await describeVideo({
      captions: captionsPath ? await Deno.readTextFile(captionsPath) : "",
      transcription: audioTranscriptionString,
      description: framesDescriptionString,
      promptAppendix: `
      Cooking video specialization:
      When generating the description, make sure to include all relevant cooking-related information that appears in the video. This includes:
      - Cooking techniques and methods
      - Ingredients and their quantities
      - Timings, durations, and temperatures
      - Tools, utensils, and equipment used
      - Key visual cues related to food preparation, presentation, or changes in the dish
      `,
    })
    const descriptionPath = join(videoDir, "description.txt")
    await Deno.writeTextFile(descriptionPath, description)

    logger.i(`[${videoId}] Extracting formatted recipe...`)
    const recipe = await extractRecipe(description)

    logger.i(`[${videoId}] Fetching detailed metadata...`)
    const metadata = await youtube.fetchDetailedMetadata({ videoUrlOrId })

    const recipesWithMetadata = recipe.result.map((r) => ({
      ...r,
      language: metadata.language as string | undefined,
      location: metadata.location as string | undefined,
      modelConfidence: recipe.confidence,
    }))

    const recipePath = join(videoDir, "recipe.json")
    await Deno.writeTextFile(recipePath, JSON.stringify(recipesWithMetadata, null, 2))
    logger.i(`[${videoId}] Result saved to ${recipePath}`)

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
      videoPathWithGenericExtension
    )
    // Retrieve downloaded file path
    const videoFile = Array.from(Deno.readDirSync(params.outDir)).find(
      (f) => f.isFile && /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name)
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
        url
      )
    } catch (e) {
      if (e instanceof CommandError) console.error(e, e.stderr)
      else console.error(e)
      return null
    }
    const captionsFile = Array.from(Deno.readDirSync(params.outDir)).find(
      (f) => f.isFile && /\.(vtt)$/i.test(f.name)
    )
    const captionsPath = captionsFile ? join(params.outDir, captionsFile.name) : null
    if (captionsPath) {
      const captions = await Deno.readTextFile(captionsPath)
      const formattedCaptions = vttToJson(captions)
      await Deno.writeTextFile(
        join(params.outDir, "captions.json"),
        JSON.stringify(formattedCaptions, null, 2)
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
}
