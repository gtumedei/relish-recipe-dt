import { env } from "@relish/env"
import { evaluateRecipeLikelihood } from "@relish/recipe-processing"
import { logger } from "@relish/shared"

// https://developers.google.com/youtube/v3/docs/search/list
const BASE_URL = "https://www.googleapis.com/youtube/v3/search"

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
    logger.i("Fetching food data from YouTube")
    const searchParams = new URLSearchParams({
      key: env.YOUTUBE_API_KEY,
      q: "food",
      part: "snippet",
      type: "video",
      maxResults: "10",
      order: "relevance",
      publishedAfter: "2025-09-20T00:00:00Z",
    } satisfies YoutubeSearchParameters)
    const url = `${BASE_URL}?${searchParams.toString()}`
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
    const items = data.items.map((item, i) => ({ score: scores[i], metadata: item }))
    return items
  },
}
