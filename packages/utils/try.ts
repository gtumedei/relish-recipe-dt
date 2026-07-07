/** Check if an object is a `Promise`. */
const isPromiseLike = (obj: unknown): obj is PromiseLike<unknown> =>
  !!obj &&
  (typeof obj === "object" || typeof obj === "function") &&
  typeof (obj as any).then === "function"

/** Check if an object is an `Error`. */
export const isError = (e: unknown): e is Error => e instanceof Error

/** Result type */
export type Result<T, E extends Error = Error> =
  | { ok: true; value: T; error: undefined }
  | { ok: false; value: undefined; error: E }

/**
 * Simple function to turn a promise of type `T` to `Result<T>`.
 *
 * i.e.: catch the error and return it as the value.
 */
function tryify<T, E extends Error = Error>(p: PromiseLike<T>): PromiseLike<Result<T, E>> {
  return p.then(
    (value: T) => ({ ok: true, value, error: undefined }),
    (error: E) => ({ ok: false, value: undefined, error }),
  )
}

/** Wraps code that throws and returns a `Result`. */
export function tryCatch<T, E extends Error = Error>(
  asyncBlock: () => PromiseLike<T>,
): PromiseLike<Result<T, E>>
export function tryCatch<T, E extends Error = Error>(block: () => T): Result<T, E>
export function tryCatch<T, E extends Error = Error>(
  promise: PromiseLike<T>,
): PromiseLike<Result<T, E>>
export function tryCatch<T, E extends Error = Error>(
  input: PromiseLike<T> | (() => T | PromiseLike<T>),
): Result<T, E> | PromiseLike<Result<T, E>> {
  // If the input is a simple promise, a simple try-ify is enough
  if (isPromiseLike(input)) return tryify(input)

  // If the input function, execute it
  try {
    const value = input()

    // If the block is an async function, try-ify the returned promise
    if (isPromiseLike(value)) return tryify<T, E>(value)

    // If the block is sync, the result is in res
    return { ok: true, value, error: undefined }
  } catch (error) {
    // Execution of the block threw (and it's obviously sync), so return the error
    return { ok: false, value: undefined, error: error as any }
  }
}
