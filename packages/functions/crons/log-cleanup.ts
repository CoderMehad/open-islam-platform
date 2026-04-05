import { Config } from "sst/node/config";
import { getDb } from "@qivam/core/db/connection";
import { requestLogs, applicationLogs } from "@qivam/core/db/schema";
import { lt } from "drizzle-orm";

// Bridge SST secret into process.env for core layer
process.env.NEON_DATABASE_URL ??= (Config as Record<string, string>).NEON_DATABASE_URL;

export async function handler() {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  await Promise.all([
    db.delete(requestLogs).where(lt(requestLogs.timestamp, cutoff)),
    db.delete(applicationLogs).where(lt(applicationLogs.timestamp, cutoff)),
  ]);
}
