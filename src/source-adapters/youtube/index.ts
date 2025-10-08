import { env } from "@relish/env"
import { evaluateRecipeLikelihood } from "@relish/recipe-processing"
import { tmpDir } from "@relish/storage"
import {
  CommandError,
  executeCommand,
  extractFramesFromVideo,
  getVideoDuration,
  logger,
  vttToJson,
} from "@relish/utils"
import { ensureDir } from "@std/fs"
import { join } from "@std/path"
import dayjs from "dayjs"

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
  pipeline: async () => {
    const data = await youtube.list({ q: "food" })
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
      const videoUrl = `https://youtube.com/watch?v=${item.metadata.id.videoId}`
      const videoDir = join(tmpDir, item.metadata.id.videoId)
      const { videoPath } = await youtube.download({
        url: videoUrl,
        outDir: videoDir,
      })

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

      // TODO: download video caption as text - see https://github.com/yt-dlp/yt-dlp/issues/7496
      const videoCaptionsDir = join(videoDir, "captions")
      const captionsRes = await executeCommand(
        "yt-dlp",
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang",
        "en,original",
        "--skip-download",
        "-P",
        videoCaptionsDir,
        videoUrl
      )
      console.log(captionsRes)
      const captionsFile = Array.from(Deno.readDirSync(videoCaptionsDir)).find(
        (f) => f.isFile && /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name)
      )
      const captionsPath = captionsFile ? join(videoCaptionsDir, captionsFile.name) : null
      console.log(captionsPath)
      // TODO: process caption files to simplify their content

      // TODO: try transcribing audio with OpenAI Whisper: https://ai-sdk.dev/docs/ai-sdk-core/transcription
      // TODO: try describing video by extracting frames (ffmpeg) and providing them as images
    }
    return items
  },

  list: async (params: Pick<YoutubeSearchParameters, "q"> & Partial<YoutubeSearchParameters>) => {
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

  download: async (params: { url: string; outDir: string; withCaptions?: boolean }) => {
    const videoPathWithGenericExtension = join(params.outDir, "video.%(ext)s")
    // Download video
    await executeCommand("yt-dlp", params.url, "-o", videoPathWithGenericExtension)
    // Retrieve downloaded file path
    const videoFile = Array.from(Deno.readDirSync(params.outDir)).find(
      (f) => f.isFile && /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name)
    )
    const videoPath = videoFile ? join(params.outDir, videoFile.name) : null
    if (!videoPath) throw new Error("Unable to retrieve the path of the downloaded video")
    // Download captions and retrieve file path if requested
    let captionsPath: string | null = null
    if (params.withCaptions) {
      await executeCommand(
        "yt-dlp",
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang",
        "en,original",
        "--skip-download",
        "-P",
        params.outDir,
        params.url
      )
      const captionsFile = Array.from(Deno.readDirSync(params.outDir)).find(
        (f) => f.isFile && /\.(vtt)$/i.test(f.name)
      )
      // TODO: format captions
      captionsPath = captionsFile ? join(params.outDir, captionsFile.name) : null
      if (captionsPath) {
        const captions = await Deno.readTextFile(captionsPath)
        const formattedCaptions = vttToJson(captions)
        await Deno.writeTextFile(
          join(params.outDir, "captions.json"),
          JSON.stringify(formattedCaptions, null, 2)
        )
      }
    }
    return { videoPath, captionsPath }
  },
}
