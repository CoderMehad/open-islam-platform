import { randomBytes } from "node:crypto";
import type { ApiKeyPublic } from "../models/api-key.model.js";
import { sha256 } from "../shared/helpers.js";
import {
  insertApiKey,
  getApiKeyByPrefix,
  getActiveApiKeyByHash,
  updateApiKeyAnalyticsEnabled,
} from "../repositories/api-key.repository.js";
import { logger } from "../adapters/logger.adapter.js";

function generateRawKey(): string {
  const bytes = randomBytes(24);
  return "qv_" + bytes.toString("base64url");
}

export interface RequestData {
  name: string;
  contactEmail: string;
}

export async function request(
  data: RequestData,
): Promise<{ key: string; prefix: string; name: string; isActive: boolean }> {
  const rawKey = generateRawKey();
  const prefix = rawKey.slice(0, 12);

  const inserted = await insertApiKey({
    prefix,
    keyHash: sha256(rawKey),
    name: data.name,
    contactEmail: data.contactEmail,
  });

  logger.info("API key created", { source: "api-keys", attributes: { prefix, name: data.name, contactEmail: data.contactEmail } });
  return { key: rawKey, prefix, name: inserted.name, isActive: inserted.isActive };
}

export async function getByPrefix(
  prefix: string,
): Promise<ApiKeyPublic | undefined> {
  return getApiKeyByPrefix(prefix);
}

export async function validate(
  rawKey: string,
): Promise<{ id: string; name: string; rateLimit: number; analyticsEnabled: boolean } | undefined> {
  const keyHash = sha256(rawKey);
  return getActiveApiKeyByHash(keyHash);
}

export async function setAnalyticsEnabled(id: string, enabled: boolean): Promise<void> {
  logger.info("Analytics preference updated", { source: "api-keys", attributes: { id, enabled } });
  return updateApiKeyAnalyticsEnabled(id, enabled);
}
