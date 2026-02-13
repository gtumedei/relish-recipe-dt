import type { AccessRule, ProtectedCollection } from "@relish/sdk"
import type { ApiKey } from "@relish/storage"

declare module "hono" {
  interface ContextVariableMap {
    apiKey?: ApiKey
    collection?: ProtectedCollection
    accessRules?: AccessRule[]
  }
}
