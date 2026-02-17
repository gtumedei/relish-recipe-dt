import { ThreadWorker } from "@poolifier/poolifier-web-worker"

const workerFn = (data?: { foo: string }) => {
  return { ok: 1, data }
}

export type WorkerData = Parameters<typeof workerFn>[number]
export type WorkerResponse = ReturnType<typeof workerFn>

export default new ThreadWorker(workerFn, {
  maxInactiveTime: 60000,
})
