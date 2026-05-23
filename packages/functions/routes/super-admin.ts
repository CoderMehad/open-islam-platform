import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../types.js";
import {
  listAllApiKeys,
  updateApiKeyActive,
  updateApiKeyAnalyticsEnabled,
} from "@qivam/core/repository/drizzle";
import {
  getByIdForAdmin,
  getProvenance as getMosqueProvenance,
  getWithAdminEmail,
  update as updateMosque,
  updateClaimStatus,
  updateVerificationStatus,
  updateVisibility,
  adminCreate,
  listForAdmin,
} from "@qivam/core/mosque";
import * as PrayerTimes from "@qivam/core/prayer-times";
import { createMosque as createMosqueSchema } from "@qivam/core/schemas/mosque";
import {
  sendMosqueApprovedEmail,
  sendMosqueRejectedEmail,
} from "@qivam/core/adapters/ses";
import { superAdminAuth } from "../middleware/super-admin-auth.js";
import { logger } from "@qivam/core/adapters/logger";

export const superAdminRoutes = new Hono<AppEnv>();

const updateMosqueBody = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().min(1).max(500).optional(),
  city: z.string().min(1).max(100).optional(),
  postcode: z.string().min(1).max(20).optional(),
  country: z.string().length(2).optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  timezone: z.string().min(1).max(64).optional(),
  facilities: z
    .array(
      z.enum([
        "parking",
        "wheelchair_access",
        "womens_area",
        "wudu_area",
        "funeral_services",
        "islamic_school",
        "library",
        "community_hall",
      ]),
    )
    .optional(),
  source: z.string().min(1).max(100).optional(),
  sourceId: z.string().max(255).nullable().optional(),
  claimStatus: z.enum(["unclaimed", "claimed"]).optional(),
  claimedBy: z.string().uuid().nullable().optional(),
  verificationStatus: z.enum(["pending", "verified", "rejected"]).optional(),
});

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

superAdminRoutes.get("/mosques", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const limit = Number(c.req.query("limit") ?? "20");
  const status = c.req.query("status");
  const result = await listForAdmin({ page, limit, status });
  return c.json(result, 200);
});

superAdminRoutes.get("/mosques/:id", async (c) => {
  const { id } = c.req.param();
  const mosque = await getByIdForAdmin(id);
  if (!mosque) return c.json({ error: "Mosque not found" }, 404);
  return c.json(mosque, 200);
});

superAdminRoutes.post(
  "/mosques",
  zValidator("json", createMosqueSchema),
  async (c) => {
    const body = c.req.valid("json");
    const mosque = await adminCreate(body);
    logger.info("Mosque created via super-admin", {
      source: "super-admin",
      attributes: { mosqueId: mosque.id, name: mosque.name },
    });
    return c.json(mosque, 201);
  },
);

const prayerScheduleBody = z.object({
  fajrAdhan: z.string().min(1).max(10),
  fajrIqamah: z.string().max(10).nullable().optional(),
  dhuhrAdhan: z.string().min(1).max(10),
  dhuhrIqamah: z.string().max(10).nullable().optional(),
  asrAdhan: z.string().min(1).max(10),
  asrIqamah: z.string().max(10).nullable().optional(),
  maghribAdhan: z.string().min(1).max(10),
  maghribIqamah: z.string().max(10).nullable().optional(),
  ishaAdhan: z.string().min(1).max(10),
  ishaIqamah: z.string().max(10).nullable().optional(),
  jummahTimes: z
    .array(
      z.object({
        adhan: z.string().min(1).max(10),
        iqamah: z.string().max(10).nullable(),
      }),
    )
    .max(3)
    .optional(),
});

superAdminRoutes.put(
  "/mosques/:id/prayer-schedule",
  zValidator("json", prayerScheduleBody),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    try {
      const schedule = await PrayerTimes.upsertSchedule(id, {
        ...body,
        jummahTimes: body.jummahTimes ?? [],
      });
      logger.info("Prayer schedule upserted via super-admin", {
        source: "super-admin",
        attributes: { mosqueId: id },
      });
      return c.json(schedule, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && (err as { cause?: unknown }).cause;
      const causeMessage = cause instanceof Error ? cause.message : String(cause ?? "");
      logger.error("Prayer schedule upsert failed", {
        source: "super-admin",
        attributes: { mosqueId: id },
        error: err instanceof Error ? err : undefined,
      });
      return c.json({ error: "Prayer schedule upsert failed", detail: message, cause: causeMessage }, 500);
    }
  },
);

superAdminRoutes.get("/mosques/:id/provenance", async (c) => {
  const { id } = c.req.param();
  const result = await getMosqueProvenance(id);
  if (!result) return c.json({ error: "Mosque not found" }, 404);
  return c.json(result, 200);
});

superAdminRoutes.patch(
  "/mosques/:id",
  zValidator("json", updateMosqueBody),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    let mosque = await updateMosque(id, body);
    if (!mosque) return c.json({ error: "Mosque not found" }, 404);

    if (body.claimStatus) {
      mosque = await updateClaimStatus(
        id,
        body.claimStatus,
        body.claimedBy ?? null,
        "Updated by super-admin",
      );
      if (!mosque) return c.json({ error: "Mosque not found" }, 404);
    }

    logger.info("Mosque updated by super-admin", {
      source: "super-admin",
      attributes: { mosqueId: id, fields: Object.keys(body) },
    });
    return c.json(mosque, 200);
  },
);

superAdminRoutes.patch("/mosques/:id/approve", async (c) => {
  const { id } = c.req.param();
  const mosque = await updateVerificationStatus(id, "verified");
  if (!mosque) return c.json({ error: "Mosque not found" }, 404);

  logger.info("Mosque approved", { source: "super-admin", attributes: { mosqueId: id, mosqueName: mosque.name } });

  try {
    const withAdmin = await getWithAdminEmail(id);
    if (withAdmin) {
      await sendMosqueApprovedEmail({
        to: withAdmin.adminEmail,
        adminName: withAdmin.adminName,
        mosqueName: withAdmin.mosque.name,
      });
    }
  } catch (err) {
    logger.error("Mosque approval email failed", { source: "super-admin", attributes: { mosqueId: id }, error: err instanceof Error ? err : undefined });
  }

  return c.json({ ok: true, mosque }, 200);
});

superAdminRoutes.patch("/mosques/:id/reject", async (c) => {
  const { id } = c.req.param();
  const mosque = await updateVerificationStatus(id, "rejected");
  if (!mosque) return c.json({ error: "Mosque not found" }, 404);

  logger.info("Mosque rejected", { source: "super-admin", attributes: { mosqueId: id, mosqueName: mosque.name } });

  try {
    const withAdmin = await getWithAdminEmail(id);
    if (withAdmin) {
      await sendMosqueRejectedEmail({
        to: withAdmin.adminEmail,
        adminName: withAdmin.adminName,
        mosqueName: withAdmin.mosque.name,
      });
    }
  } catch (err) {
    logger.error("Mosque rejection email failed", { source: "super-admin", attributes: { mosqueId: id }, error: err instanceof Error ? err : undefined });
  }

  return c.json({ ok: true, mosque }, 200);
});

superAdminRoutes.patch(
  "/mosques/:id/visibility",
  zValidator("json", z.object({ isPublished: z.boolean() })),
  async (c) => {
    const { id } = c.req.param();
    const { isPublished } = c.req.valid("json");
    const mosque = await updateVisibility(id, isPublished);
    if (!mosque) return c.json({ error: "Mosque not found" }, 404);

    logger.info("Mosque visibility updated", {
      source: "super-admin",
      attributes: { mosqueId: id, mosqueName: mosque.name, isPublished },
    });

    return c.json({ ok: true, mosque }, 200);
  },
);
