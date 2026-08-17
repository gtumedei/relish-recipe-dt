import { z } from "zod"

// https://developers.google.com/youtube/v3/docs/search/list
// All fields are optional and get merged with default values.
export const YoutubeSearchParametersSchema = z.object({
  q: z.string().optional(),
  part: z.literal("snippet").optional(),
  type: z.literal("video").optional(),
  maxResults: z.string().optional(), // 50 max
  order: z.enum(["date", "rating", "relevance", "title", "viewCount"]).optional(),
  publishedBefore: z.string().optional(), // e.g.: 1970-01-01T00:00:00Z
  publishedAfter: z.string().optional(), // e.g.: 1970-01-01T00:00:00Z
  location: z.string().optional(), // e.g.: "37.42307,-122.08427"
  locationRadius: z.string().optional(), // 1000km max
  relevanceLanguage: z.string().optional(), // http://www.loc.gov/standards/iso639-2/php/code_list.php
})

export type YoutubeSearchParameters = z.infer<typeof YoutubeSearchParametersSchema>
