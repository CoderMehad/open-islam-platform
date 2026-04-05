import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { register, login } from "@qivam/core/auth";
import type { AppEnv } from "../types.js";
import {
  registerSchema,
  loginSchema,
  tokenResponse,
} from "@qivam/core/schemas/auth";
import { errorResponse } from "@qivam/core/schemas/common";
import { logger } from "@qivam/core/adapters/logger";

export const authRoutes = new OpenAPIHono<AppEnv>();

// ── Register ────────────────────────────────────────────────────────────────

const registerRoute = createRoute({
  method: "post",
  path: "/register",
  request: {
    body: { content: { "application/json": { schema: registerSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: tokenResponse } },
      description: "Admin registered",
    },
    409: {
      content: { "application/json": { schema: errorResponse } },
      description: "Email already registered",
    },
  },
});

authRoutes.openapi(registerRoute, async (c) => {
  const data = c.req.valid("json");
  const result = await register(data);
  return c.json(result, 201);
});

// ── Login ───────────────────────────────────────────────────────────────────

const loginRoute = createRoute({
  method: "post",
  path: "/login",
  request: {
    body: { content: { "application/json": { schema: loginSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: tokenResponse } },
      description: "Login successful",
    },
    401: {
      content: { "application/json": { schema: errorResponse } },
      description: "Invalid credentials",
    },
  },
});

authRoutes.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const result = await login(email, password);
  if (!result) {
    logger.warn("Login rejected", { source: "auth", attributes: { email } });
    return c.json({ error: "Invalid email or password" }, 401);
  }
  return c.json(result, 200);
});
