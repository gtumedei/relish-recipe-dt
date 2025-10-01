import "@relish/env"

import { logger } from "@relish/shared"
import { youtube } from "@relish/source-adapters"

const ytRes = await youtube.fetch()
logger.i(ytRes)
logger.i("Done")
