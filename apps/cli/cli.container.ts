import { createSdkClient } from "@relish/sdk"
import { createPrismaClient } from "@relish/storage"
import { Container, withDependencies } from "@relish/utils/di"
import { createLogger } from "@relish/utils/logger"

const db = createPrismaClient()
const logger = createLogger()
const sdk = withDependencies({ db }, createSdkClient)

export const container: Container = { db, logger, sdk }
