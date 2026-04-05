import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";
import { getDb } from "@qivam/core/db/connection";
import { requestLogs } from "@qivam/core/db/schema";
import { logStore, flushLogBuffer } from "@qivam/core/adapters/logger";
import type { LogRow } from "@qivam/core/adapters/logger";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  const reqId = c.get("requestId");

  const ctx = { requestId: reqId, buffer: [] as LogRow[] };

  await logStore.run(ctx, async () => {
    await next();
  });

  const responseTime = Date.now() - start;
  const status = c.res.status;
  const rawKey = c.req.header("X-API-Key") ?? null;
  const sizeHeader = c.res.headers.get("content-length");

  // Auto-log errors for 4xx/5xx responses
  if (status >= 400) {
    ctx.buffer.push({
      timestamp: new Date(),
      requestId: reqId,
      level: "error",
      message: `HTTP ${status} ${c.req.method} ${c.req.path}`,
      source: "request-logger",
      attributes: { method: c.req.method, path: c.req.path, statusCode: status },
      errorStack: null,
    });
  }

  // Respect analytics opt-out for request log insert, but always flush app logs
  const apiKeyCtx = c.get("apiKey");
  const skipRequestLog = apiKeyCtx && !apiKeyCtx.analyticsEnabled;

  try {
    const db = getDb();
    const promises: Promise<unknown>[] = [];

    if (!skipRequestLog) {
      promises.push(
        db.insert(requestLogs).values({
          requestId: reqId,
          method: c.req.method,
          path: c.req.path,
          statusCode: status,
          responseTime,
          responseSize: sizeHeader ? Number(sizeHeader) : null,
          apiKeyPrefix: rawKey ? rawKey.slice(-8) : null,
          userAgent: c.req.header("user-agent") ?? null,
          clientIp:
            c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          routeMatched: c.req.routePath ?? null,
        }),
      );
    }

    if (ctx.buffer.length > 0) {
      promises.push(flushLogBuffer(ctx.buffer));
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  } catch {
    // Silently swallow — no stdout fallback
  }
});
