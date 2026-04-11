import type { PrayerTimeEntry } from "../models/prayer-times.model.js";
import type { PaginatedResult } from "../models/shared.model.js";
import {
  getPrayerTimes,
  getTodayPrayerTimes,
  upsertPrayerTime,
  bulkUpsertPrayerTimes,
} from "../repositories/prayer-times.repository.js";
import { logger } from "../adapters/logger.adapter.js";

export interface GetOptions {
  date?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface UpsertData {
  date: string;
  adhan: {
    fajr: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    jummah?: string | null;
  };
  iqamah?: {
    fajr?: string | null;
    dhuhr?: string | null;
    asr?: string | null;
    maghrib?: string | null;
    isha?: string | null;
    jummah?: string | null;
  };
}

export async function getForMosque(
  mosqueId: string,
  opts: GetOptions = {},
): Promise<PaginatedResult<PrayerTimeEntry>> {
  return getPrayerTimes(mosqueId, opts);
}

export async function getToday(
  mosqueId: string,
): Promise<PrayerTimeEntry | undefined> {
  return getTodayPrayerTimes(mosqueId);
}

export async function upsert(
  mosqueId: string,
  data: UpsertData,
): Promise<PrayerTimeEntry> {
  const result = await upsertPrayerTime(mosqueId, data);
  logger.info("Prayer time upserted", { source: "prayer-times", attributes: { mosqueId, date: data.date } });
  return result;
}

export async function bulkUpsert(
  mosqueId: string,
  entries: UpsertData[],
): Promise<PrayerTimeEntry[]> {
  const result = await bulkUpsertPrayerTimes(mosqueId, entries);
  logger.info("Prayer times bulk upserted", { source: "prayer-times", attributes: { mosqueId, count: entries.length } });
  return result;
}
