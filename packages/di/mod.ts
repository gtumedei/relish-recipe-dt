import { Adapters } from "@relish/source-adapters"
import { Logger } from "@relish/utils/logger"
import { AsyncLocalStorage } from "node:async_hooks"

/** List all of your dependencies here */
export type Dependencies = {
  logger: Logger
  adapters: Adapters
}

const storage = new AsyncLocalStorage<Dependencies>()

export const withDependencies = <TRet>(ctx: Dependencies, fn: () => TRet): TRet =>
  storage.run(ctx, fn)

export const withSelectedDependencies = <
  TDeps extends Partial<Dependencies>,
  TFnArgs extends any[],
  TRet,
>(
  ctx: TDeps,
  fn: (this: TDeps, ...args: TFnArgs) => TRet,
): TRet => storage.run(ctx as any, fn)

const getStore = (): Dependencies => {
  const ctx = storage.getStore()
  if (!ctx)
    throw new Error(
      "DI context not found. Did you forget to wrap execution in `provide()` or pass `this` explicitly?",
    )
  return ctx
}

/** Get a `Logger` instance from AsyncLocalStorage. The parent call chain must be wrapped by a `withDependencies` at some point, or the function will throw. */
export const getLogger = () => getStore().logger

/** Get an `Adapters` instance from AsyncLocalStorage. The parent call chain must be wrapped by a `withDependencies` at some point, or the function will throw. */
export const getAdapters = () => getStore().adapters
