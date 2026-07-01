import { SdkClient } from "@relish/sdk"
import { SourceAdapter } from "@relish/source-adapters"
import { PrismaClient } from "@relish/storage"
import { AsyncLocalStorage } from "node:async_hooks"
import { Logger } from "./logger.ts"

function createDIStorage<TContainer extends object>() {
  const storage = new AsyncLocalStorage<TContainer>()

  function withContainer<TRet>(ctx: TContainer, fn: () => TRet): TRet {
    return storage.run(ctx, fn)
  }

  function withDependencies<TDeps extends Partial<TContainer>, TFnArgs extends any[], TRet>(
    ctx: TDeps,
    fn: (this: TDeps, ...args: TFnArgs) => TRet,
  ): TRet {
    return storage.run(ctx as any, fn)
  }

  function inject(): TContainer {
    const ctx = storage.getStore()
    if (!ctx)
      throw new Error(
        "DI context not found. Did you forget to wrap execution in `provide()` or pass `this` explicitly?",
      )
    return ctx
  }

  function resolve<TDeps extends keyof TContainer>(
    self: Pick<TContainer, TDeps> | void,
  ): Pick<TContainer, TDeps> {
    return (self ?? inject()) as Pick<TContainer, TDeps>
  }

  return { withContainer, withDependencies, inject, resolve }
}

/** Container type to create simple DI-like modules for the various runtimes (REST API, CLI, workers, etc.) */
export type Container = {
  logger: Logger
  db: PrismaClient
  sdk: SdkClient
  adapters: {
    youtube: SourceAdapter
  }
}

export type Requires<TDeps extends keyof Container> = Pick<Container, TDeps> | void

export const { withContainer, withDependencies, resolve } = createDIStorage<Container>()
