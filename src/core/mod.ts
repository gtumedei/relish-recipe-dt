export type Dish = {
  name: string // Unique
  description: string
  media: Media[]
  recipes: Recipe[]
}

export type Recipe = {
  ingredients: ((Ingredient | Dish) & Quantity)[]
  tools: (Tool & { alternatives?: Tool[] })[]
  steps: Step[]
  totalPrepTime: number
  media: Media[]
}

export type Ingredient = {
  name: string
  media: Media[]
}

export type Quantity = {
  quantity: string
  unit: string
}

export type Step = {
  description: string
  ingredients: ((Ingredient | Dish) & Quantity)[]
  tools: Tool[]
  time: number
}

export type Tool = {
  name: string
  media: Media[]
}

export type Media = {
  url: string
  description?: string
}
