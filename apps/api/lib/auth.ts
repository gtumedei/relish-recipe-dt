import { db } from "@relish/storage"
import type { Context, Next } from "hono"
import { describeRoute } from "hono-openapi"
import { every } from "hono/combine"
import { security } from "~/lib/openapi-utils.ts"
import { AccessRule, ProtectedCollection } from "@relish/sdk"

/**
 * Block access if no valid API key is provided via Bearer token.
 *
 * Provides `apiKey` as context to downstream middlewares.
 */
export const apiKeyAuth = every(
  async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401)

    const token = authHeader.substring(7) // Remove "Bearer " prefix
    const key = await db.apiKey.findUnique({ where: { key: token } })
    if (!key) return c.json({ error: "Unauthorized" }, 401)

    c.set("apiKey", key)
    await next()
  },
  describeRoute({ security: security.bearerAuth }),
)

/**
 * Block access if the provided API key does not give access to the specified `collection`.
 *
 * Provides `accessRules` as context to downstream middlewares.
 */
export const requireCollectionAccess =
  (collection: ProtectedCollection) => async (c: Context, next: Next) => {
    const apiKey = c.get("apiKey")
    if (!apiKey) return c.json({ error: "Unauthorized" }, 401)

    const collectionAccess = apiKey.access.find((it) => it.collection == collection)
    if (!collectionAccess) return c.json({ error: "Unauthorized" }, 401)

    c.set("accessRules", collectionAccess.rules)
    await next()
  }

/**
 * Block access if the provided API key and collection don't include the specified access `rule`.
 */
export const requireAccessRule = (rule: AccessRule) => async (c: Context, next: Next) => {
  const rules = c.get("accessRules")
  if (!rules || !rules.includes(rule)) return c.json({ error: "Unauthorized" }, 401)

  await next()
}
