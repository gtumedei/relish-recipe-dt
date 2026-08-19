import { cleanupTmpDir, db } from "@relish/storage"

export const setupCronjobs = () => {
  // Every 5 minutes, cleanup tasks that have not been updated for at least 30 minutes
  Deno.cron("Stuck tasks cleanup", "*/5 * * * *", async () => {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000)
    const stuckTasks = await db.task.findMany({
      where: { updatedAt: { lt: cutoff }, completedAt: { not: null } },
    })
    await db.task.updateMany({
      data: { status: "CANCELED", completedAt: new Date() },
      where: { id: { in: stuckTasks.map((t) => t.id) } },
    })
  })

  // Every day at 00:00, cleanup temporary files and folders older than 1 week.
  Deno.cron("Temporary files cleanup", "0 0 * * *", async () => {
    await cleanupTmpDir()
  })

  // TODO: add a cronjob to processAllDishes
}
