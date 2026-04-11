import { createMiddleware } from "hono/factory";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { logger } from "@qivam/core/adapters/logger";
import type { AppEnv } from "../types.js";

const WINDOW_MS = 60_000;
const dynamo = new DynamoDBClient({});
const tableName = process.env.RATE_LIMIT_TABLE_NAME;

export const rateLimiter = createMiddleware<AppEnv>(async (c, next) => {
  const apiKey = c.get("apiKey");
  const limit = apiKey.rateLimit;
  const now = Date.now();
  const bucketStartMs = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const resetAtSeconds = Math.ceil((bucketStartMs + WINDOW_MS) / 1000);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucketStartMs + WINDOW_MS - now) / 1000),
  );

  if (!tableName) {
    logger.error("Rate limiter misconfigured", {
      source: "rate-limit",
      attributes: { apiKeyId: apiKey.id, limit },
    });
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", "0");
    c.header("X-RateLimit-Reset", String(resetAtSeconds));
    c.header("Retry-After", String(retryAfterSeconds));
    return c.json({ error: "Rate limiter unavailable" }, 503);
  }

  try {
    const response = await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: {
          apiKeyId: { S: apiKey.id },
          windowBucket: { S: String(Math.floor(bucketStartMs / WINDOW_MS)) },
        },
        UpdateExpression:
          "ADD requestCount :increment SET expiresAt = :expiresAt, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":increment": { N: "1" },
          ":expiresAt": { N: String(Math.ceil((bucketStartMs + WINDOW_MS * 2) / 1000)) },
          ":updatedAt": { N: String(Math.ceil(now / 1000)) },
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );

    const currentCount = Number(response.Attributes?.requestCount?.N ?? "0");
    const remaining = Math.max(0, limit - currentCount);

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetAtSeconds));

    if (currentCount > limit) {
      logger.warn("Rate limit denied", {
        source: "rate-limit",
        attributes: {
          apiKeyId: apiKey.id,
          limit,
          currentCount,
          windowBucket: Math.floor(bucketStartMs / WINDOW_MS),
        },
      });
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    logger.info("Rate limit allowed", {
      source: "rate-limit",
      attributes: {
        apiKeyId: apiKey.id,
        limit,
        currentCount,
        remaining,
        windowBucket: Math.floor(bucketStartMs / WINDOW_MS),
      },
    });
  } catch (error) {
    logger.error("Rate limiter backend error", {
      source: "rate-limit",
      attributes: {
        apiKeyId: apiKey.id,
        limit,
        windowBucket: Math.floor(bucketStartMs / WINDOW_MS),
      },
      error: error instanceof Error ? error : undefined,
    });
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", "0");
    c.header("X-RateLimit-Reset", String(resetAtSeconds));
    c.header("Retry-After", String(retryAfterSeconds));
    return c.json({ error: "Rate limiter unavailable" }, 503);
  }

  await next();
});
