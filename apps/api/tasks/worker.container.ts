import { createSdkClient } from "@relish/sdk"
import { ContainerFactory } from "@relish/utils/types"
import { createPersistedTaskLogger } from "~/lib/task-logger.ts"

export const createWorkerContainer: ContainerFactory<{ taskId: string }> = async (args) => {
  const mod = await import("@relish/storage")
  const db = mod.createPrismaClient()
  const logger = createPersistedTaskLogger(db, args.taskId)
  const sdk = createSdkClient({ db })

  return { logger, db, sdk }
}
