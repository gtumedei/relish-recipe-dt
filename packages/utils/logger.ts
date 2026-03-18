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

export const createLogger = (params?: {
  afterLog?: (entry: LogHistoryEntry) => Promise<void>
}): Logger => {
  let history: Logger["history"] = []

  const afterLog = params?.afterLog ?? (async () => {})

  const logger: Logger = {
    i: (...args) => {
      const entry: LogHistoryEntry = { timestamp: new Date(), type: "I", payload: args }
      history.push(entry)
      console.log(...[c.blue("[i]"), ...args])
      afterLog(entry)
    },
    s: (...args) => {
      const entry: LogHistoryEntry = { timestamp: new Date(), type: "S", payload: args }
      history.push(entry)
      console.log(...[c.green("[✓]"), ...args])
      afterLog(entry)
    },
    w: (...args) => {
      const entry: LogHistoryEntry = { timestamp: new Date(), type: "W", payload: args }
      history.push(entry)
      console.log(...[c.yellow("[!]"), ...args])
      afterLog(entry)
    },
    e: (...args) => {
      const entry: LogHistoryEntry = { timestamp: new Date(), type: "E", payload: args }
      history.push(entry)
      console.log(...[c.red("[x]"), ...args])
      afterLog(entry)
    },
    history,
    clearHistory: () => {
      history = []
    },
  }

  return logger
}
