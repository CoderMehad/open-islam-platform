import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import {
  listAllApiKeys,
  updateApiKeyActive,
  updateApiKeyAnalyticsEnabled,
} from "@qivam/core/repository/drizzle";
import {
  updateMosqueVerificationStatus,
  getMosqueWithAdminEmail,
} from "@qivam/core/repositories/mosque";
import {
  sendMosqueApprovedEmail,
  sendMosqueRejectedEmail,
} from "@qivam/core/adapters/ses";
import { superAdminAuth } from "../middleware/super-admin-auth.js";
import { logger } from "@qivam/core/adapters/logger";

export const superAdminRoutes = new Hono<AppEnv>();

superAdminRoutes.use("*", superAdminAuth);

// ── API Keys ────────────────────────────────────────────────────────────────

superAdminRoutes.get("/api-keys", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const limit = Number(c.req.query("limit") ?? "20");
  const result = await listAllApiKeys({ page, limit });
  return c.json(result, 200);
});

superAdminRoutes.patch("/api-keys/:id/activate", async (c) => {
  const { id } = c.req.param();
  const key = await updateApiKeyActive(id, true);
  if (!key) return c.json({ error: "API key not found" }, 404);
  logger.info("API key activated", { source: "super-admin", attributes: { keyId: id } });
  return c.json(key, 200);
});

superAdminRoutes.patch("/api-keys/:id/deactivate", async (c) => {
  const { id } = c.req.param();
  const key = await updateApiKeyActive(id, false);
  if (!key) return c.json({ error: "API key not found" }, 404);
  logger.warn("API key deactivated", { source: "super-admin", attributes: { keyId: id } });
  return c.json(key, 200);
});

superAdminRoutes.patch("/api-keys/:id/analytics-opt-in", async (c) => {
  const { id } = c.req.param();
  await updateApiKeyAnalyticsEnabled(id, true);
  return c.json({ ok: true }, 200);
});

superAdminRoutes.patch("/api-keys/:id/analytics-opt-out", async (c) => {
  const { id } = c.req.param();
  await updateApiKeyAnalyticsEnabled(id, false);
  return c.json({ ok: true }, 200);
});

// ── Mosques ──────────────────────────────────────────────────────────────────

superAdminRoutes.patch("/mosques/:id/approve", async (c) => {
  const { id } = c.req.param();
  const result = await getMosqueWithAdminEmail(id);
  if (!result) return c.json({ error: "Mosque not found" }, 404);

  const mosque = await updateMosqueVerificationStatus(id, "verified");
  if (!mosque) return c.json({ error: "Mosque not found" }, 404);

  logger.info("Mosque approved", { source: "super-admin", attributes: { mosqueId: id, mosqueName: result.mosque.name } });

  try {
    await sendMosqueApprovedEmail({
      to: result.adminEmail,
      adminName: result.adminName,
      mosqueName: result.mosque.name,
    });
  } catch (err) {
    logger.error("Mosque approval email failed", { source: "super-admin", attributes: { mosqueId: id }, error: err instanceof Error ? err : undefined });
  }

  return c.json({ ok: true, mosque }, 200);
});

superAdminRoutes.patch("/mosques/:id/reject", async (c) => {
  const { id } = c.req.param();
  const result = await getMosqueWithAdminEmail(id);
  if (!result) return c.json({ error: "Mosque not found" }, 404);

  const mosque = await updateMosqueVerificationStatus(id, "rejected");
  if (!mosque) return c.json({ error: "Mosque not found" }, 404);

  logger.info("Mosque rejected", { source: "super-admin", attributes: { mosqueId: id, mosqueName: result.mosque.name } });

  try {
    await sendMosqueRejectedEmail({
      to: result.adminEmail,
      adminName: result.adminName,
      mosqueName: result.mosque.name,
    });
  } catch (err) {
    logger.error("Mosque rejection email failed", { source: "super-admin", attributes: { mosqueId: id }, error: err instanceof Error ? err : undefined });
  }

  return c.json({ ok: true, mosque }, 200);
});

