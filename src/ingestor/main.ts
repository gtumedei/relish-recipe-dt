import "@relish/env"

import { logger } from "@relish/shared"
import { youtube } from "@relish/source-adapters"
import { join } from "@std/path"
import { ensureDir } from "@std/fs"

const tmpDir = join(import.meta.dirname!, "..", "..", "tmp")
ensureDir(tmpDir)

const ytRes = await youtube.fetch()

const filename = join(tmpDir, "res-youtube.json")
await Deno.writeTextFile(filename, JSON.stringify(ytRes, null, 2))
logger.i(`Results saved to ${filename}`)
