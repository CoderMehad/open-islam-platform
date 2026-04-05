import { createMiddleware } from "hono/factory";
import { logger } from "@qivam/core/adapters/logger";
import type { AppEnv } from "../types.js";

// In-memory sliding window per API key (per warm Lambda instance)
const windows = new Map<string, number[]>();

// Clean up old entries every 60s to prevent memory leaks
const WINDOW_MS = 60_000;
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, filtered);
    }
  }
}, WINDOW_MS);

export const rateLimiter = createMiddleware<AppEnv>(async (c, next) => {
  const apiKey = c.get("apiKey");
  const limit = apiKey.rateLimit;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const timestamps = windows.get(apiKey.id) ?? [];
  const recent = timestamps.filter((t) => t > cutoff);

  if (recent.length >= limit) {
    logger.warn("Rate limit exceeded", { source: "rate-limit", attributes: { apiKeyId: apiKey.id, limit, current: recent.length } });
    c.header("Retry-After", "60");
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  recent.push(now);
  windows.set(apiKey.id, recent);

  const resetAt = Math.ceil((now + WINDOW_MS) / 1000);
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(Math.max(0, limit - recent.length)));
  c.header("X-RateLimit-Reset", String(resetAt));

  await next();
});
