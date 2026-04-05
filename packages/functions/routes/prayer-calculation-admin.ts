import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as Mosque from "@qivam/core/mosque";
import * as PrayerTimes from "@qivam/core/prayer-times";
import {
  calculateForRange,
  resolveMethod,
} from "@qivam/core/lib/prayer-calculation";
import type {
  CalculationConfig,
  Coordinates,
  PrayerAdjustments,
} from "@qivam/core/lib/prayer-calculation";
import type { AppEnv } from "../types.js";
import { jwtAuth } from "../middleware/admin-auth.js";
import { requireOwnership } from "../middleware/ownership.js";
import { errorResponse } from "@qivam/core/schemas/common";
import { prayerTimesResponse } from "@qivam/core/schemas/prayer-times";
import { generateBody } from "@qivam/core/schemas/prayer-calculation";
import { logger } from "@qivam/core/adapters/logger";

export const prayerCalculationAdminRoutes = new OpenAPIHono<AppEnv>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// POST /mosques/{id}/prayer-times/generate
// ---------------------------------------------------------------------------

const generateRoute = createRoute({
  method: "post",
  path: "/{id}/prayer-times/generate",
  middleware: [jwtAuth, requireOwnership()],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: generateBody } } },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(prayerTimesResponse),
            generated: z.number(),
          }),
        },
      },
      description: "Prayer times calculated and stored",
    },
    404: {
      content: { "application/json": { schema: errorResponse } },
      description: "Mosque not found",
    },
    400: {
      content: { "application/json": { schema: errorResponse } },
      description: "Invalid date range",
    },
  },
});

prayerCalculationAdminRoutes.openapi(generateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const mosque = await Mosque.getByIdOrSlug(id);
  if (!mosque) {
    logger.warn("Prayer generation failed — mosque not found", { source: "prayer-generation", attributes: { mosqueId: id } });
    return c.json({ error: "Mosque not found" }, 404);
  }

  const startDate = parseDate(body.from);
  const endDate = parseDate(body.to);

  if (endDate < startDate) {
    logger.warn("Prayer generation failed — invalid date range", { source: "prayer-generation", attributes: { mosqueId: id, from: body.from, to: body.to } });
    return c.json({ error: "'to' date must be on or after 'from' date" }, 400);
  }

  // Cap at 366 days to prevent abuse
  const dayCount = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (dayCount > 366) {
    logger.warn("Prayer generation failed — range too large", { source: "prayer-generation", attributes: { mosqueId: id, dayCount } });
    return c.json({ error: "Date range cannot exceed 366 days" }, 400);
  }

  const adjustments: PrayerAdjustments = {};
  if (body.fajr_adjustment) adjustments.fajr = body.fajr_adjustment;
  if (body.sunrise_adjustment) adjustments.sunrise = body.sunrise_adjustment;
  if (body.dhuhr_adjustment) adjustments.dhuhr = body.dhuhr_adjustment;
  if (body.asr_adjustment) adjustments.asr = body.asr_adjustment;
  if (body.maghrib_adjustment) adjustments.maghrib = body.maghrib_adjustment;
  if (body.isha_adjustment) adjustments.isha = body.isha_adjustment;

  const config: CalculationConfig = {
    method: body.method,
    madhab: body.madhab ?? "standard",
    highLatitudeRule: body.high_latitude_rule ?? "middle_of_night",
    adjustments: Object.keys(adjustments).length > 0 ? adjustments : undefined,
  };

  const coords: Coordinates = { latitude: mosque.lat, longitude: mosque.lng };
  const calculated = calculateForRange(startDate, endDate, coords, config, mosque.timezone);

  // Map calculated times to UpsertData format (drop sunrise + midnight since PrayerTimeEntry doesn't store them)
  const entries: PrayerTimes.UpsertData[] = calculated.map((entry) => ({
    date: entry.date,
    fajr: entry.times.fajr,
    dhuhr: entry.times.dhuhr,
    asr: entry.times.asr,
    maghrib: entry.times.maghrib,
    isha: entry.times.isha,
  }));

  const stored = await PrayerTimes.bulkUpsert(id, entries);

  logger.info("Prayer times generated and stored", { source: "prayer-generation", attributes: { mosqueId: id, from: body.from, to: body.to, count: stored.length, method: body.method } });
  return c.json({ data: stored, generated: stored.length }, 201);
});
