import { env } from "@relish/env"
import { evaluateRecipeLikelihood } from "@relish/recipe-processing"
import {
  logger,
  executeCommand,
  extractFramesFromVideo,
  getVideoDuration,
  CommandError,
} from "@relish/shared"
import { tmpDir } from "@relish/storage"
import { join } from "@std/path"
import dayjs from "dayjs"
import { ensureDir } from "@std/fs"

// https://developers.google.com/youtube/v3/docs/search/list
const BASE_URL = "https://www.googleapis.com/youtube/v3/search"

// Discard videos that score lower than the recipe likelihood (1-5 scale)
const RECIPE_LIKELIHOOD_THRESHOLD = 1

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

export const youtube = {
  fetch: async () => {
    const params = {
      key: env.YOUTUBE_API_KEY,
      q: "food",
      part: "snippet",
      type: "video",
      maxResults: "3",
      order: "relevance",
      publishedAfter: dayjs().startOf("D").subtract(1, "w").toISOString(), // Fetch videos uploaded in the last week
    } satisfies YoutubeSearchParameters
    logger.i("Fetching food data from YouTube with the following parameters: ", params)
    const url = `${BASE_URL}?${new URLSearchParams(params).toString()}`
    const res = await fetch(url)
    const data = (await res.json()) as YoutubeSearchResult
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
    for (const item of items) {
      logger.i(`[${item.metadata.id.videoId}] Downloading video...`)
      const videoDir = join(tmpDir, item.metadata.id.videoId)
      try {
        await executeCommand(
          "yt-dlp",
          `https://youtube.com/watch?v=${item.metadata.id.videoId}`,
          "-o",
          `${videoDir}/${item.metadata.id.videoId}.%(ext)s`
        )
      } catch (e) {
        logger.e(`${item.metadata.id.videoId} An error occurred while downloading the video`)
        if (e instanceof CommandError) {
          logger.e(e.stdout)
          logger.e(e.stderr)
        } else {
          logger.e(e)
        }
        continue
      }
      const videoFile = Array.from(Deno.readDirSync(videoDir)).find(
        (f) => f.isFile && /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name)
      )
      const videoPath = videoFile ? join(videoDir, videoFile.name) : null
      if (!videoPath) {
        logger.e(`${item.metadata.id.videoId} Unable to retrieve the path of the downloaded video`)
        continue
      }
      logger.i(`[${item.metadata.id.videoId}] Getting video metadata`)
      const duration = await getVideoDuration(videoPath)
      logger.i(`[${item.metadata.id.videoId}] Extracting frames (${Math.floor(duration ?? 0)})...`)
      const framesDir = join(videoDir, "frames")
      await ensureDir(framesDir)
      try {
        await extractFramesFromVideo({
          videoPath,
          outDir: join(videoDir, "frames"),
          fps: 1,
        })
      } catch (e) {
        logger.e(`${item.metadata.id.videoId} An error occurred while extracting the video frames`)
        if (e instanceof CommandError) {
          logger.e(e.stdout)
          logger.e(e.stderr)
        } else {
          logger.e(e)
        }
        continue
      }
      // TODO: try transcribing audio with OpenAI Whisper: https://ai-sdk.dev/docs/ai-sdk-core/transcription
      // TODO: try describing video by extracting frames (ffmpeg) and providing them as images
    }
    return items
  },
}
