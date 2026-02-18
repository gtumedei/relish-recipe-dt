import { type PrismaClient } from "@relish/storage"
import { createLogger } from "@relish/utils/logger"

export const createPersistedTaskLogger = (db: PrismaClient, taskId: string) => {
  const logger = createLogger({
    afterLog: async () => {
      await db.task.update({
        where: { id: taskId },
        data: {
          logs: logger.history.map((entry) => ({
            ...entry,
            payload: entry.payload.map((it) => JSON.stringify(it)),
          })),
        },
      })
    },
  })
  return logger
}
