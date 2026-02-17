import { createLogger } from "@relish/utils/logger"
import { db } from "@relish/storage"

export const createPersistedTaskLogger = (taskId: string) => {
  const logger = createLogger({
    afterLog: async () => {
      await db.task.update({
        where: { id: taskId },
        data: { logs: logger.history },
      })
    },
  })
  return logger
}
