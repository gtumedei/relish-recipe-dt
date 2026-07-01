export type ListResult<TItem> = {
  items: TItem[]
  page: number
  pageCount: number
  totalItemCount: number
}

export const DEFAULT_PAGE_SIZE = 16
