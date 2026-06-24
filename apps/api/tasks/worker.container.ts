import { createSdkClient } from "@relish/sdk"
import { Container, withDependencies } from "@relish/utils/di"
import { createPersistedTaskLogger } from "~/lib/task-logger.ts"

export const createWorkerContainer = async (args: { taskId: string }): Promise<Container> => {
  const mod = await import("@relish/storage")
  const db = mod.createPrismaClient()
  const logger = createPersistedTaskLogger(db, args.taskId)
  const sdk = withDependencies({ db }, createSdkClient)

  return { logger, db, sdk }
}
