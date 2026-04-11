import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as Mosque from "@qivam/core/mosque";
import type { AppEnv } from "../types.js";
import { apiKeyAuth } from "../middleware/api-key.js";
import { rateLimiter } from "../middleware/rate-limit.js";
import { publicCache } from "../middleware/cache.js";
import {
  mosqueResponse,
  listQuery,
  nearbyQuery,
} from "@qivam/core/schemas/mosque";
import { errorResponse, paginationMeta } from "@qivam/core/schemas/common";
import { logger } from "@qivam/core/adapters/logger";

export const mosqueRoutes = new OpenAPIHono<AppEnv>();

// ── Public routes (API key required) ────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [apiKeyAuth, rateLimiter, publicCache],
  request: {
    query: listQuery,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(mosqueResponse),
          }).merge(paginationMeta),
        },
      },
      description: "List of mosques",
    },
  },
});

mosqueRoutes.openapi(listRoute, async (c) => {
  const query = c.req.valid("query");
  const result = await Mosque.list({
    page: query.page,
    limit: query.limit,
    q: query.q,
    city: query.city,
    country: query.country,
    facilities: query.facilities,
    source: query.source,
    claimStatus: query.claim_status,
  });
  return c.json(result, 200);
});

const nearbyRoute = createRoute({
  method: "get",
  path: "/nearby",
  middleware: [apiKeyAuth, rateLimiter, publicCache],
  request: {
    query: nearbyQuery,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(mosqueResponse.extend({ distance_km: z.number() })),
          }),
        },
      },
      description: "Nearby mosques",
    },
  },
});

mosqueRoutes.openapi(nearbyRoute, async (c) => {
  const query = c.req.valid("query");
  const result = await Mosque.nearby({
    lat: query.lat,
    lng: query.lng,
    radiusKm: query.radius_km,
    limit: query.limit,
  });
  return c.json({ data: result }, 200);
});

const getRoute = createRoute({
  method: "get",
  path: "/{id}",
  middleware: [apiKeyAuth, rateLimiter, publicCache],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: mosqueResponse } },
      description: "Mosque details",
    },
    404: {
      content: { "application/json": { schema: errorResponse } },
      description: "Mosque not found",
    },
  },
});

mosqueRoutes.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const mosque = await Mosque.getByIdOrSlug(id);
  if (!mosque) {
    logger.warn("Mosque not found", { source: "mosques", attributes: { idOrSlug: id } });
    return c.json({ error: "Mosque not found" }, 404);
  }
  return c.json(mosque, 200);
});
