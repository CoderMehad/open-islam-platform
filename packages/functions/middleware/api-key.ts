import { createMiddleware } from "hono/factory";
import { validate } from "@qivam/core/api-key";
import { logger } from "@qivam/core/adapters/logger";
import type { AppEnv } from "../types.js";

export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  const key = c.req.header("X-API-Key");
  if (!key) {
    logger.warn("API key auth failed — missing header", { source: "api-key-auth" });
    return c.json({ error: "Missing X-API-Key header" }, 401);
  }

  const result = await validate(key);
  if (!result) {
    logger.warn("API key auth failed — invalid or inactive", { source: "api-key-auth", attributes: { keyPrefix: key.slice(-8) } });
    return c.json({ error: "Invalid or inactive API key" }, 401);
  }

  c.set("apiKey", result);
  await next();
});
