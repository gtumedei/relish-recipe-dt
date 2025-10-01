import { ensureDir } from "@std/fs"
import { join } from "@std/path"

export const tmpDir = join(import.meta.dirname!, "..", "..", "tmp")

ensureDir(tmpDir)
