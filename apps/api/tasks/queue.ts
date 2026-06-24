import { Queue } from "bullmq"

export const TASKS_QUEUE_NAME = "tasks"

export type TaskData = { foo: string }

export const queue = new Queue<TaskData>(TASKS_QUEUE_NAME)
