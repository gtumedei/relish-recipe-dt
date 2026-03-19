import { SdkClient } from "@relish/sdk"
import { PrismaClient } from "@relish/storage"
import { Logger } from "./logger.ts"

/** Container type to create simple DI-like modules for the various runtimes (REST API, CLI, workers, etc.) */
export type Container = {
  logger: Logger
  db: PrismaClient
  sdk: SdkClient
}

export type ContainerOf<TDeps extends keyof Container> = Pick<Container, TDeps>

/** Factory function for dependency containers, with optional parameters. */
export type ContainerFactory<TParams = void> = (params: TParams) => Container | Promise<Container>
