import { createSdkClient } from "@relish/sdk"
import { createYoutubeAdapter } from "@relish/source-adapters/youtube"
import { createPrismaClient } from "@relish/storage"
import { Container, withDependencies } from "@relish/utils/di"
import { createLogger } from "@relish/utils/logger"

const db = createPrismaClient()
const logger = createLogger()
const sdk = withDependencies({ db }, createSdkClient)
const adapters = {
  youtube: withDependencies({ logger }, createYoutubeAdapter),
}

export const container: Container = { db, logger, sdk, adapters }
