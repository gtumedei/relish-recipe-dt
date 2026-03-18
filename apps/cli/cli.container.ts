import { createSdkClient } from "@relish/sdk"
import { createPrismaClient } from "@relish/storage"
import { createLogger } from "@relish/utils/logger"
import { Container } from "@relish/utils/types"

const db = createPrismaClient()
const logger = createLogger()
const sdk = createSdkClient({ db })

export const container: Container = { db, logger, sdk }
