import "@relish/env"

import { youtube } from "@relish/source-adapters"
import { logger } from "@relish/utils"

const ytRes = await youtube.fetch()
logger.i(ytRes)
logger.i("Done")
