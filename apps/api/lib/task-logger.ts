import { PrismaClient } from "@relish/storage"
import { createLogger, type Logger } from "@relish/utils/logger"

export const createPersistedTaskLogger = (
  db: PrismaClient,
  { taskId, jobId, prefix }: { taskId: string; jobId?: string; prefix?: string },
): Logger => {
  // Track in-flight writes so `flush` can await them before the job ends
  const inFlight = new Set<Promise<void>>()

  const logger = createLogger({
    prefix,
    afterLog: (entry) => {
      const write = (async () => {
        await db.taskLog.create({
          data: {
            taskId,
            jobId: jobId ?? null,
            type: entry.type,
            payload: entry.payload.map((it) => JSON.stringify(it)),
          },
        })
      })()
      inFlight.add(write)
      // Drop the write from the in-flight list once it settles
      const settle = () => inFlight.delete(write)
      write.then(settle, settle)
      return write
    },
    flush: async () => {
      await Promise.allSettled(inFlight)
    },
  })

  return logger
}
