export type ListResult<TItem> = {
  items: TItem[]
  page: number
  pageCount: number
  totalItemCount: number
}

export const PAGE_SIZE = 16
