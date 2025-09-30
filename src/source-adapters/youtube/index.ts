// https://developers.google.com/youtube/v3/docs/search/list

import { env } from "@relish/env"

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

export const youtube = {
  fetch: async () => {
    const searchParams = new URLSearchParams({
      key: env.YOUTUBE_API_KEY,
      q: "food",
      part: "snippet",
      type: "video",
      maxResults: "50",
      order: "relevance",
      publishedAfter: "2025-09-20T00:00:00Z",
    } satisfies YoutubeSearchParameters)
    const url = `${BASE_URL}?${searchParams.toString()}`
    const res = await fetch(url)
    const data = await res.json()
    return data
  },
}
