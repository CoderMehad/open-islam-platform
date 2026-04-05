import { createMiddleware } from "hono/factory";
import { verifyToken } from "@qivam/core/auth";
import { getAdminById } from "@qivam/core/repositories/admin";
import { logger } from "@qivam/core/adapters/logger";
import type { AppEnv } from "../types.js";

export const jwtAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    logger.warn("JWT auth failed — missing header", { source: "admin-auth" });
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = header.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
    logger.warn("JWT auth failed — invalid token", { source: "admin-auth" });
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const admin = await getAdminById(payload.sub);
  if (!admin) {
    logger.warn("JWT auth failed — admin not found", { source: "admin-auth", attributes: { adminId: payload.sub } });
    return c.json({ error: "Admin not found" }, 401);
  }

  c.set("admin", { id: admin.id, mosqueId: admin.mosqueId });
  await next();
});
