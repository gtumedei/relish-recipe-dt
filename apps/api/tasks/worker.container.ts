import { createSdkClient } from "@relish/sdk"
import { createYoutubeAdapter } from "@relish/source-adapters/youtube"
import { createPrismaClient } from "@relish/storage"
import { Container, withDependencies } from "@relish/utils/di"
import { createPersistedTaskLogger } from "~/lib/task-logger.ts"

export const createWorkerContainer = (args: { taskId: string }): Container => {
  const db = createPrismaClient()
  const logger = createPersistedTaskLogger(db, args.taskId)
  const sdk = withDependencies({ db }, createSdkClient)
  const adapters = {
    youtube: withDependencies({ logger }, createYoutubeAdapter),
  }

  return { logger, db, sdk, adapters }
}
