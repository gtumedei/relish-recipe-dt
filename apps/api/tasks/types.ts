export type TaskType = "processAllDishes" | "processDish" | "processDishFromSource"

export type TaskParameters =
  | ({ type: "processAllDishes" } & Parameters<ProcessAllDishesTask>[0])
  | ({ type: "processDish" } & Parameters<ProcessDishTask>[0])
  | ({ type: "processDishFromSource" } & Parameters<ProcessDishFromSourceTask>[0])

type BaseTaskData = { taskId?: string; parentTaskId?: string }

export type TaskResultMap = {
  processAllDishes: ProcessAllDishesResult
  processDish: ProcessDishResult
  processDishFromSource: ProcessDishFromSourceResult
}

export type TaskResult = TaskResultMap[TaskType]

export type ProcessAllDishesTask = (parameters: BaseTaskData) => Promise<ProcessAllDishesResult>

export type ProcessDishTask = (
  parameters: BaseTaskData & { dishId: string },
) => Promise<ProcessDishResult>

export type ProcessDishFromSourceTask = (
  parameters: BaseTaskData & { dishId: string; adapter: string; sourceUrl: string },
) => Promise<ProcessDishFromSourceResult>

export type ProcessAllDishesResult = {
  success: boolean
  dishesProcessed: number
  recipesCreated: number
  dishResults: ProcessDishResult[]
  errors: ProcessingError[]
}

export type ProcessDishResult = {
  success: boolean
  dishId: string
  dishName: string
  sourcesProcessed: number
  recipesCreated: number
  errors: ProcessingError[]
}

export type ProcessDishFromSourceResult = {
  success: boolean
  recipesCreated: number
  errors: ProcessingError[]
}

export type ProcessingError = {
  context: string
  message: string
  cause?: unknown
}
