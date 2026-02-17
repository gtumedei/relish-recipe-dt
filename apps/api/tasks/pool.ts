import {
  availableParallelism,
  DynamicThreadPool,
  PoolEvents,
} from "@poolifier/poolifier-web-worker"
import { WorkerData, WorkerResponse } from "~/tasks/worker.ts"

const workerFileURL = new URL("./worker.ts", import.meta.url)

export const pool = new DynamicThreadPool<WorkerData, WorkerResponse>(
  Math.floor(availableParallelism() / 2),
  availableParallelism(),
  workerFileURL,
  {
    startWorkers: false,
    errorEventHandler: (e) => {
      console.error(e)
    },
  },
)

pool.eventTarget?.addEventListener(PoolEvents.ready, () => console.info("Pool is ready"))
pool.eventTarget?.addEventListener(PoolEvents.full, () => console.info("Pool is full"))
pool.eventTarget?.addEventListener(PoolEvents.busy, () => console.info("Pool is busy"))
