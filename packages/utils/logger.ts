import * as c from "@std/fmt/colors"

type LogFunction = typeof console.log

export type Logger = {
  /** Log an information message. */
  i: LogFunction
  /** Log a success message. */
  s: LogFunction
  /** Log a warning message. */
  w: LogFunction
  /** Log an error message. */
  e: LogFunction
  history: LogHistoryEntry[]
  clearHistory: () => void
}

type LogHistoryEntry = {
  timestamp: Date
  type: "I" | "S" | "W" | "E"
  payload: any[]
}

export const createLogger = ({
  afterLog = async () => {},
}: {
  afterLog?: (entry: LogHistoryEntry) => Promise<void>
} = {}): Logger => {
  let history: Logger["history"] = []

  const getLogFn: (params: { type: LogHistoryEntry["type"]; prefix: string }) => LogFunction =
    ({ type, prefix }) =>
    (...args) => {
      const entry: LogHistoryEntry = { timestamp: new Date(), type, payload: args }
      history.push(entry)
      console.log(...[prefix, ...expandErrors(args)])
      afterLog(entry)
    }

  const logger: Logger = {
    i: getLogFn({ type: "I", prefix: c.blue("[i]") }),
    s: getLogFn({ type: "S", prefix: c.green("[✓]") }),
    w: getLogFn({ type: "W", prefix: c.yellow("[!]") }),
    e: getLogFn({ type: "E", prefix: c.red("[x]") }),
    history,
    clearHistory: () => {
      history = []
    },
  }

  return logger
}

/** Expand any `Error` instances in a list of log arguments into a full
 * formatted block, leaving other arguments (strings, objects, etc.)
 * untouched. */
const expandErrors = (args: any[]): any[] =>
  args.map((arg) => (arg instanceof Error ? "\n" + formatError(arg) : arg))

/**
 * Recursively format an `Error`, following `.cause` chains and, for
 * `AggregateError`, all of its `.errors`. Non-Error values fall back to
 * `formatValue`, so it's always safe to call on whatever a log function
 * receives.
 */
export const formatError = (err: unknown): string => {
  if (!(err instanceof Error)) return formatValue(err)

  const parts: string[] = [formatSingleError(err)]

  if (err instanceof AggregateError && Array.isArray(err.errors) && err.errors.length > 0) {
    parts.push(`  aggregated errors (${err.errors.length}):`)
    err.errors.forEach((sub, i) => {
      parts.push(`  [${i}]`)
      parts.push(indent(formatError(sub), "    "))
    })
  }

  const cause = (err as { cause?: unknown }).cause
  if (cause !== undefined) {
    parts.push("  caused by:")
    parts.push(indent(formatError(cause), "    "))
  }

  return parts.join("\n")
}

/** Keys that already get special treatment and shouldn't be repeated in the generic "extra properties" section. */
const STANDARD_ERROR_KEYS = new Set(["name", "message", "stack"])

/**
 * Format a single Error (without following `cause` or `errors`) into a
 * human-readable, plain-text block: name + message, any custom own
 * properties (e.g. `code`, `status`, `details`, ...), and the stack trace.
 */
const formatSingleError = (err: Error) => {
  const lines: string[] = []

  lines.push(`${err.name || "Error"}${err.message ? `: ${err.message}` : ""}`)

  // Pick up any own property, standard or not (e.g. `code` on a Deno/Node error, or fields a custom Error subclass attaches to `this`).
  const extraKeys = Object.getOwnPropertyNames(err).filter(
    (key) => !STANDARD_ERROR_KEYS.has(key) && key !== "cause" && key !== "errors",
  )

  if (extraKeys.length > 0) {
    lines.push("  properties:")
    for (const key of extraKeys) {
      let value: unknown
      try {
        value = (err as unknown as Record<string, unknown>)[key]
      } catch {
        value = "<unreadable>"
      }
      lines.push(indent(`${key}: ${formatValue(value)}`, "    "))
    }
  }

  if (err.stack) {
    // Drop the first line of `stack` since it just repeats name/message.
    const stackBody = err.stack.split("\n").slice(1).join("\n")
    if (stackBody) {
      lines.push("  stack:")
      lines.push(indent(stackBody, "    "))
    }
  } else {
    lines.push("  (no stack trace available)")
  }

  return lines.join("\n")
}

/** Format an arbitrary non-Error value for display. */
const formatValue = (value: unknown) => {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const indent = (text: string, prefix = "  ") =>
  text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n")
