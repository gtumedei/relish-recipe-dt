import { logger } from "@relish/shared"

logger.i("Hello, World!")

import { db } from "@relish/database"
const dbRes = await db.dinosaur.findMany()
logger.i(dbRes)

// import { youtube } from "@relish/source-adapters"
// const ytRes = await youtube.fetch()
// logger.i(ytRes)
