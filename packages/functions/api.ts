import { Config } from "sst/node/config";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "@qivam/core/errors";
import type { AppEnv } from "./types.js";
import { requestId } from "./middleware/request-id.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { mosqueRoutes } from "./routes/mosques.js";
import { mosqueAdminRoutes } from "./routes/mosques-admin.js";
import { prayerTimesRoutes } from "./routes/prayer-times.js";
import { prayerTimesAdminRoutes } from "./routes/prayer-times-admin.js";
import { prayerCalculationRoutes, standalonePrayerCalculationRoutes } from "./routes/prayer-calculation.js";
import { prayerCalculationAdminRoutes } from "./routes/prayer-calculation-admin.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { superAdminRoutes } from "./routes/super-admin.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import { logger } from "@qivam/core/adapters/logger";

// Bridge SST Config.Secret values into process.env for core layer
process.env.NEON_DATABASE_URL ??= (Config as Record<string, string>).NEON_DATABASE_URL;
process.env.JWT_SECRET ??= (Config as Record<string, string>).JWT_SECRET;
process.env.SUPER_ADMIN_KEY ??= (Config as Record<string, string>).SUPER_ADMIN_KEY;
process.env.SUPER_ADMIN_EMAIL ??= (Config as Record<string, string>).SUPER_ADMIN_EMAIL;

const app = new OpenAPIHono<AppEnv>();

// ── Global middleware ────────────────────────────────────────────────────────

const stage = process.env.SST_STAGE ?? "dev";
const isProduction = stage === "production";

app.use(
  "*",
  cors({
    origin: isProduction
      ? ["https://qivam.com", "https://www.qivam.com", "https://docs.qivam.com"]
      : "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-Id", "X-Super-Admin-Key"],
    maxAge: 86400,
  }),
);

app.use("*", requestId);

// ── Error handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  const reqId = c.get("requestId");

  if (err instanceof AppError) {
    return c.json({ error: err.message, requestId: reqId }, err.statusCode as ContentfulStatusCode);
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error("Unhandled error", { source: "error-handler", attributes: { error: message, requestId: reqId }, error: err instanceof Error ? err : undefined });
  return c.json({ error: "Internal server error", requestId: reqId }, 500);
});

// ── Consumer routes (documented in OpenAPI spec) ─────────────────────────────

const consumerApp = new OpenAPIHono<AppEnv>();
consumerApp.use("*", requestLogger);

// Developer endpoints (X-API-Key)
consumerApp.route("/mosques", mosqueRoutes);
consumerApp.route("/mosques", prayerTimesRoutes);
consumerApp.route("/mosques", prayerCalculationRoutes);
consumerApp.route("/prayer-times", standalonePrayerCalculationRoutes);
consumerApp.route("/api-keys", apiKeyRoutes);
consumerApp.route("/analytics", analyticsRoutes);

// Mosque admin endpoints (Bearer JWT)
consumerApp.route("/auth", authRoutes);
consumerApp.route("/mosques", mosqueAdminRoutes);
consumerApp.route("/mosques", prayerTimesAdminRoutes);
consumerApp.route("/mosques", prayerCalculationAdminRoutes);

consumerApp.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description: "API key for developer access. Request one at /api-keys/request.",
});

consumerApp.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT token for mosque admin access. Obtain via POST /auth/login.",
});

consumerApp.doc("/docs/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Qivam API",
    description: "Open infrastructure for Muslim developers — mosque directory, prayer times, and Islamic content.\n\n**Authentication:**\n- Developer endpoints: `X-API-Key` header\n- Mosque admin endpoints: `Authorization: Bearer <token>` (JWT from `/auth/login`)",
    version: "1.0.0",
  },
  servers: [{ url: "/v1" }],
});

consumerApp.get(
  "/docs",
  apiReference({
    url: "/v1/docs/openapi.json",
    theme: "kepler",
    pageTitle: "Qivam API Docs",
  }),
);

// ── Routes ───────────────────────────────────────────────────────────────────

// Unversioned health check for load balancers
app.route("/", healthRoutes);

// Consumer API with docs
app.route("/v1", consumerApp);

// Super admin routes — protected by X-Super-Admin-Key header (not in docs)
app.route("/v1/super", superAdminRoutes);

export const handler = handle(app);
