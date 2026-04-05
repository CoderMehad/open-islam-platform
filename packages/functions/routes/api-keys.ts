import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as ApiKey from "@qivam/core/api-key";
import type { AppEnv } from "../types.js";
import { requestApiKey, apiKeyResponse, apiKeyStatus } from "@qivam/core/schemas/api-key";
import { errorResponse } from "@qivam/core/schemas/common";
import { sendApiKeyEmail } from "@qivam/core/adapters/ses";
import { logger } from "@qivam/core/adapters/logger";

export const apiKeyRoutes = new OpenAPIHono<AppEnv>();

const requestRoute = createRoute({
  method: "post",
  path: "/request",
  request: {
    body: { content: { "application/json": { schema: requestApiKey } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: apiKeyResponse } },
      description: "API key created",
    },
  },
});

apiKeyRoutes.openapi(requestRoute, async (c) => {
  const data = c.req.valid("json");
  const result = await ApiKey.request(data);

  try {
    await sendApiKeyEmail({
      to: data.contactEmail,
      name: data.name,
      apiKey: result.key,
      prefix: result.prefix,
    });
  } catch (err) {
    logger.error("Failed to send API key email", {
      source: "api-keys",
      attributes: { prefix: result.prefix, email: data.contactEmail },
      error: err instanceof Error ? err : undefined,
    });
  }

  return c.json(result, 201);
});

const statusRoute = createRoute({
  method: "get",
  path: "/{prefix}",
  request: {
    params: z.object({ prefix: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: apiKeyStatus } },
      description: "API key status",
    },
    404: {
      content: { "application/json": { schema: errorResponse } },
      description: "API key not found",
    },
  },
});

apiKeyRoutes.openapi(statusRoute, async (c) => {
  const { prefix } = c.req.valid("param");
  const key = await ApiKey.getByPrefix(prefix);
  if (!key) {
    logger.warn("API key lookup failed — not found", { source: "api-keys", attributes: { prefix } });
    return c.json({ error: "API key not found" }, 404);
  }
  return c.json({
    prefix: key.prefix,
    name: key.name,
    isActive: key.isActive,
    createdAt: key.createdAt,
  }, 200);
});
