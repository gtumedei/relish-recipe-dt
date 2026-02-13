export class SdkError extends Error {
  code: ErrorCode

  constructor(params: { code: ErrorCode; message?: string }) {
    super(params.message)
    this.code = params.code
  }
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"

export const toHttpStatus = (code: ErrorCode) => {
  switch (code) {
    case "BAD_REQUEST":
      return 400
    case "UNAUTHORIZED":
      return 401
    case "FORBIDDEN":
      return 403
    case "NOT_FOUND":
      return 404
    case "INTERNAL_SERVER_ERROR":
      return 500
  }
}
