import { createMiddleware } from "hono/factory";
import { logger } from "@qivam/core/adapters/logger";
import type { AppEnv } from "../types.js";

export function requireOwnership(param = "id") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const admin = c.get("admin");
    const resourceMosqueId = c.req.param(param);

    if (admin.mosqueId !== resourceMosqueId) {
      logger.warn("Ownership check failed", { source: "ownership", attributes: { adminId: admin.id, adminMosqueId: admin.mosqueId, resourceMosqueId } });
      return c.json({ error: "You do not own this resource" }, 403);
    }

    await next();
  });
}
