import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  calculatePrayerTimes,
  calculateQibla,
  resolveMethod,
  CALCULATION_METHODS,
} from "@qivam/core/lib/prayer-calculation";
import type {
  CalculationConfig,
  PrayerAdjustments,
  Coordinates,
} from "@qivam/core/lib/prayer-calculation";
import type { AppEnv } from "../types.js";
import { apiKeyAuth } from "../middleware/api-key.js";
import { rateLimiter } from "../middleware/rate-limit.js";
import { publicCache } from "../middleware/cache.js";
import {
  standaloneCalculateQuery,
  standaloneQiblaQuery,
  calculatedTimesResponse,
  calculatedTimesRangeResponse,
  methodsResponse,
  qiblaResponse,
} from "@qivam/core/schemas/prayer-calculation";
import { inferTimezone } from "@qivam/core/shared/helpers";
import { logger } from "@qivam/core/adapters/logger";

export const standalonePrayerCalculationRoutes = new OpenAPIHono<AppEnv>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawParams {
  method: string;
  madhab?: string;
  high_latitude_rule?: string;
  fajr_adjustment?: number;
  sunrise_adjustment?: number;
  dhuhr_adjustment?: number;
  asr_adjustment?: number;
  maghrib_adjustment?: number;
  isha_adjustment?: number;
}

function buildConfig(params: RawParams): CalculationConfig {
  const adjustments: PrayerAdjustments = {};
  if (params.fajr_adjustment) adjustments.fajr = params.fajr_adjustment;
  if (params.sunrise_adjustment) adjustments.sunrise = params.sunrise_adjustment;
  if (params.dhuhr_adjustment) adjustments.dhuhr = params.dhuhr_adjustment;
  if (params.asr_adjustment) adjustments.asr = params.asr_adjustment;
  if (params.maghrib_adjustment) adjustments.maghrib = params.maghrib_adjustment;
  if (params.isha_adjustment) adjustments.isha = params.isha_adjustment;

  return {
    method: params.method as CalculationConfig["method"],
    madhab: (params.madhab ?? "standard") as CalculationConfig["madhab"],
    highLatitudeRule: (params.high_latitude_rule ?? "middle_of_night") as CalculationConfig["highLatitudeRule"],
    adjustments: Object.keys(adjustments).length > 0 ? adjustments : undefined,
  };
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// GET /v1/prayer-times/methods
// ---------------------------------------------------------------------------

const methodsRoute = createRoute({
  method: "get",
  path: "/methods",
  middleware: [apiKeyAuth, rateLimiter],
  request: {},
  responses: {
    200: {
      content: { "application/json": { schema: methodsResponse } },
      description: "Supported prayer time calculation methods",
    },
  },
});

standalonePrayerCalculationRoutes.openapi(methodsRoute, (c) => {
  const data = Object.values(CALCULATION_METHODS).map((m) => ({
    id: m.id,
    name: m.name,
    fajrAngle: m.fajrAngle,
    isha: m.isha,
  }));
  return c.json({ data }, 200);
});

// ---------------------------------------------------------------------------
// GET /v1/prayer-times/calculate (standalone — no mosque required)
// ---------------------------------------------------------------------------

const standaloneCalculateRoute = createRoute({
  method: "get",
  path: "/calculate",
  middleware: [apiKeyAuth, rateLimiter, publicCache],
  request: {
    query: standaloneCalculateQuery,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: calculatedTimesRangeResponse.or(calculatedTimesResponse),
        },
      },
      description: "Calculated prayer times for given coordinates",
    },
  },
});

standalonePrayerCalculationRoutes.openapi(standaloneCalculateRoute, async (c) => {
  const query = c.req.valid("query");
  logger.info("Standalone prayer calculation", { source: "prayer-calculation", attributes: { lat: query.latitude, lng: query.longitude, method: query.method ?? "mwl", days: query.days } });

  const resolvedMethod = query.method ?? "mwl";
  const resolvedTimezone = query.timezone ?? inferTimezone(query.latitude, query.longitude);

  const config = buildConfig({ ...query, method: resolvedMethod });
  const coords: Coordinates = {
    latitude: query.latitude,
    longitude: query.longitude,
    elevation: query.elevation,
  };
  const method = resolveMethod(resolvedMethod as CalculationConfig["method"]);
  const meta = {
    method: method.name,
    madhab: (query.madhab ?? "standard") as string,
    timezone: resolvedTimezone,
    coordinates: { latitude: query.latitude, longitude: query.longitude },
  };

  if (query.days > 1) {
    const data = [];
    const startDate = query.date
      ? parseDate(query.date)
      : new Date();

    for (let i = 0; i < query.days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const times = calculatePrayerTimes(d, coords, config, resolvedTimezone);
      data.push({ date: dateStr, prayers: times, meta });
    }
    return c.json({ data }, 200);
  }

  const date = query.date ? parseDate(query.date) : new Date();
  const dateStr = query.date ?? new Date().toISOString().slice(0, 10);
  const times = calculatePrayerTimes(date, coords, config, resolvedTimezone);

  return c.json({ date: dateStr, prayers: times, meta }, 200);
});

// ---------------------------------------------------------------------------
// GET /v1/prayer-times/qibla (standalone — coordinates provided by caller)
// ---------------------------------------------------------------------------

const standaloneQiblaRoute = createRoute({
  method: "get",
  path: "/qibla",
  middleware: [apiKeyAuth, rateLimiter, publicCache],
  request: {
    query: standaloneQiblaQuery,
  },
  responses: {
    200: {
      content: { "application/json": { schema: qiblaResponse } },
      description: "Qibla direction from given coordinates",
    },
  },
});

standalonePrayerCalculationRoutes.openapi(standaloneQiblaRoute, (c) => {
  const { latitude, longitude } = c.req.valid("query");
  const result = calculateQibla({ latitude, longitude });
  logger.info("Standalone qibla calculated", { source: "prayer-calculation", attributes: { latitude, longitude } });
  return c.json({ ...result, coordinates: { latitude, longitude } }, 200);
});
