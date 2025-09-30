import c from "chalk"

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
  history: {
    i: LogHistoryEntry[]
    s: LogHistoryEntry[]
    w: LogHistoryEntry[]
    e: LogHistoryEntry[]
  }
  clearHistory: () => void
}

type LogHistoryEntry = {
  timestamp: Date
  payload: any[]
}

export const createLogger = (): Logger => {
  const history: Logger["history"] = {
    i: [],
    s: [],
    w: [],
    e: [],
  }

  const logger: Logger = {
    i: (...args) => {
      history.i.push({ timestamp: new Date(), payload: args })
      console.log(...[c.blue("[i]"), ...args])
    },
    s: (...args) => {
      history.s.push({ timestamp: new Date(), payload: args })
      console.log(...[c.green("[✓]"), ...args])
    },
    w: (...args) => {
      history.w.push({ timestamp: new Date(), payload: args })
      console.log(...[c.yellow("[!]"), ...args])
    },
    e: (...args) => {
      history.e.push({ timestamp: new Date(), payload: args })
      console.log(...[c.red("[x]"), ...args])
    },
    history,
    clearHistory: () => {
      history.i = []
      history.s = []
      history.w = []
      history.e = []
    },
  }

  return logger
}

export const logger = createLogger()
