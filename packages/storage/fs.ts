import { ensureDir } from "@std/fs"
import { join } from "@std/path"

export const TMP_DIR = join(import.meta.dirname!, "..", "..", "tmp")

await ensureDir(TMP_DIR)

export const cleanupTmpDir = async ({
  maxAgeDays = 7,
  dryRun = false,
}: {
  maxAgeDays?: number
  dryRun?: boolean
}) => {
  const now = Date.now()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000

  let deletedCount = 0
  let deletedSize = 0

  const walkAndDelete = async (dir: string) => {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = `${dir}/${entry.name}`

      let stat: Deno.FileInfo
      try {
        stat = await Deno.stat(fullPath)
      } catch (err) {
        console.warn(`[!] Failed to stat ${fullPath}:`, err)
        continue
      }
      const age = now - (stat.mtime?.getTime() ?? 0)

      if (entry.isDirectory) {
        await walkAndDelete(fullPath)

        // Re-check directory after cleaning children
        let isEmpty = true
        for await (const _ of Deno.readDir(fullPath)) {
          isEmpty = false
          break
        }

        if (isEmpty && age > maxAgeMs) {
          if (!dryRun) await Deno.remove(fullPath)
          deletedCount++
        }
      } else if (entry.isFile) {
        if (age > maxAgeMs) {
          if (!dryRun) await Deno.remove(fullPath)
          deletedCount++
          deletedSize += stat.size ?? 0
        }
      }
    }
  }

  await walkAndDelete(TMP_DIR)

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Deleted ${deletedCount} items (${(deletedSize / 1024 / 1024).toFixed(2)} MB)`,
  )
}
