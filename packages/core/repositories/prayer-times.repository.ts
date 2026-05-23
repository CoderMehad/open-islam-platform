import { eq, and, gte, lte, sql, asc, count } from "drizzle-orm";
import { getDb } from "../adapters/neon.adapter.js";
import { mosques, prayerTimes, prayerSchedules } from "../schemas/drizzle.schema.js";
import type { JummahSlot, PrayerSchedule, PrayerTimeEntry } from "../models/prayer-times.model.js";
import type { PaginatedResult } from "../models/shared.model.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

// ── Row Mapper ────────────────────────────────────────────────────────────────

function mapPrayerTimeRow(row: typeof prayerTimes.$inferSelect): PrayerTimeEntry {
  return {
    id: row.id,
    mosqueId: row.mosqueId,
    date: row.date,
    adhan: {
      fajr: row.fajrAdhan,
      dhuhr: row.dhuhrAdhan,
      asr: row.asrAdhan,
      maghrib: row.maghribAdhan,
      isha: row.ishaAdhan,
      jummah: row.jummahAdhan ?? null,
    },
    iqamah: {
      fajr: row.fajrIqamah ?? row.fajrAdhan,
      dhuhr: row.dhuhrIqamah ?? row.dhuhrAdhan,
      asr: row.asrIqamah ?? row.asrAdhan,
      maghrib: row.maghribIqamah ?? row.maghribAdhan,
      isha: row.ishaIqamah ?? row.ishaAdhan,
      jummah: row.jummahIqamah ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export interface GetPrayerTimesOpts {
  date?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function getPrayerTimes(
  mosqueId: string,
  opts: GetPrayerTimesOpts = {},
): Promise<PaginatedResult<PrayerTimeEntry>> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(opts.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const conditions = [eq(prayerTimes.mosqueId, mosqueId)];

  if (opts.date) {
    conditions.push(eq(prayerTimes.date, opts.date));
  }
  if (opts.from) {
    conditions.push(gte(prayerTimes.date, opts.from));
  }
  if (opts.to) {
    conditions.push(lte(prayerTimes.date, opts.to));
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(prayerTimes)
      .where(whereClause)
      .orderBy(asc(prayerTimes.date))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(prayerTimes)
      .where(whereClause),
  ]);

  const total = Number(countResult[0].total);
  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map(mapPrayerTimeRow),
    page,
    limit,
    total,
    totalPages,
  };
}

export async function getTodayPrayerTimes(
  mosqueId: string,
): Promise<PrayerTimeEntry | undefined> {
  const db = getDb();

  // Look up mosque timezone to compute the correct local date
  const mosqueRows = await db
    .select({ timezone: mosques.timezone })
    .from(mosques)
    .where(eq(mosques.id, mosqueId))
    .limit(1);

  const tz = mosqueRows[0]?.timezone ?? "UTC";
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const rows = await db
    .select()
    .from(prayerTimes)
    .where(
      and(eq(prayerTimes.mosqueId, mosqueId), eq(prayerTimes.date, todayStr)),
    )
    .limit(1);

  return rows[0] ? mapPrayerTimeRow(rows[0]) : undefined;
}

export async function upsertPrayerTime(
  mosqueId: string,
  data: {
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
  },
): Promise<PrayerTimeEntry> {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .insert(prayerTimes)
    .values({
      mosqueId,
      date: data.date,
      fajrAdhan: data.adhan.fajr,
      fajrIqamah: data.iqamah?.fajr ?? null,
      dhuhrAdhan: data.adhan.dhuhr,
      dhuhrIqamah: data.iqamah?.dhuhr ?? null,
      asrAdhan: data.adhan.asr,
      asrIqamah: data.iqamah?.asr ?? null,
      maghribAdhan: data.adhan.maghrib,
      maghribIqamah: data.iqamah?.maghrib ?? null,
      ishaAdhan: data.adhan.isha,
      ishaIqamah: data.iqamah?.isha ?? null,
      jummahAdhan: data.adhan.jummah ?? null,
      jummahIqamah: data.iqamah?.jummah ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [prayerTimes.mosqueId, prayerTimes.date],
      set: {
        fajrAdhan: data.adhan.fajr,
        fajrIqamah: data.iqamah?.fajr ?? null,
        dhuhrAdhan: data.adhan.dhuhr,
        dhuhrIqamah: data.iqamah?.dhuhr ?? null,
        asrAdhan: data.adhan.asr,
        asrIqamah: data.iqamah?.asr ?? null,
        maghribAdhan: data.adhan.maghrib,
        maghribIqamah: data.iqamah?.maghrib ?? null,
        ishaAdhan: data.adhan.isha,
        ishaIqamah: data.iqamah?.isha ?? null,
        jummahAdhan: data.adhan.jummah ?? null,
        jummahIqamah: data.iqamah?.jummah ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return mapPrayerTimeRow(rows[0]);
}

export async function bulkUpsertPrayerTimes(
  mosqueId: string,
  entries: Array<{
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
  }>,
): Promise<PrayerTimeEntry[]> {
  const db = getDb();
  const now = new Date();

    const values = entries.map((data) => ({
      mosqueId,
      date: data.date,
      fajrAdhan: data.adhan.fajr,
      fajrIqamah: data.iqamah?.fajr ?? null,
      dhuhrAdhan: data.adhan.dhuhr,
      dhuhrIqamah: data.iqamah?.dhuhr ?? null,
      asrAdhan: data.adhan.asr,
      asrIqamah: data.iqamah?.asr ?? null,
      maghribAdhan: data.adhan.maghrib,
      maghribIqamah: data.iqamah?.maghrib ?? null,
      ishaAdhan: data.adhan.isha,
      ishaIqamah: data.iqamah?.isha ?? null,
      jummahAdhan: data.adhan.jummah ?? null,
      jummahIqamah: data.iqamah?.jummah ?? null,
      createdAt: now,
      updatedAt: now,
    }));

  const rows = await db
    .insert(prayerTimes)
    .values(values)
    .onConflictDoUpdate({
      target: [prayerTimes.mosqueId, prayerTimes.date],
      set: {
        fajrAdhan: sql`excluded.fajr_adhan`,
        fajrIqamah: sql`excluded.fajr_iqamah`,
        dhuhrAdhan: sql`excluded.dhuhr_adhan`,
        dhuhrIqamah: sql`excluded.dhuhr_iqamah`,
        asrAdhan: sql`excluded.asr_adhan`,
        asrIqamah: sql`excluded.asr_iqamah`,
        maghribAdhan: sql`excluded.maghrib_adhan`,
        maghribIqamah: sql`excluded.maghrib_iqamah`,
        ishaAdhan: sql`excluded.isha_adhan`,
        ishaIqamah: sql`excluded.isha_iqamah`,
        jummahAdhan: sql`excluded.jummah_adhan`,
        jummahIqamah: sql`excluded.jummah_iqamah`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();

  return rows.map(mapPrayerTimeRow);
}

// ── Prayer Schedule (standing times) ─────────────────────────────────────────

function mapScheduleRow(row: typeof prayerSchedules.$inferSelect): PrayerSchedule {
  return {
    mosqueId:      row.mosqueId,
    fajrAdhan:     row.fajrAdhan,
    fajrIqamah:    row.fajrIqamah ?? null,
    dhuhrAdhan:    row.dhuhrAdhan,
    dhuhrIqamah:   row.dhuhrIqamah ?? null,
    asrAdhan:      row.asrAdhan,
    asrIqamah:     row.asrIqamah ?? null,
    maghribAdhan:  row.maghribAdhan,
    maghribIqamah: row.maghribIqamah ?? null,
    ishaAdhan:     row.ishaAdhan,
    ishaIqamah:    row.ishaIqamah ?? null,
    jummahTimes:   row.jummahTimes as JummahSlot[],
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
  };
}

export async function upsertPrayerSchedule(
  mosqueId: string,
  data: {
    fajrAdhan: string;     fajrIqamah?: string | null;
    dhuhrAdhan: string;    dhuhrIqamah?: string | null;
    asrAdhan: string;      asrIqamah?: string | null;
    maghribAdhan: string;  maghribIqamah?: string | null;
    ishaAdhan: string;     ishaIqamah?: string | null;
    jummahTimes?: JummahSlot[];
  },
): Promise<PrayerSchedule> {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .insert(prayerSchedules)
    .values({
      mosqueId,
      fajrAdhan:     data.fajrAdhan,
      fajrIqamah:    data.fajrIqamah ?? null,
      dhuhrAdhan:    data.dhuhrAdhan,
      dhuhrIqamah:   data.dhuhrIqamah ?? null,
      asrAdhan:      data.asrAdhan,
      asrIqamah:     data.asrIqamah ?? null,
      maghribAdhan:  data.maghribAdhan,
      maghribIqamah: data.maghribIqamah ?? null,
      ishaAdhan:     data.ishaAdhan,
      ishaIqamah:    data.ishaIqamah ?? null,
      jummahTimes:   sql`${JSON.stringify(data.jummahTimes ?? [])}::jsonb`,
      createdAt:     now,
      updatedAt:     now,
    })
    .onConflictDoUpdate({
      target: prayerSchedules.mosqueId,
      set: {
        fajrAdhan:     data.fajrAdhan,
        fajrIqamah:    data.fajrIqamah ?? null,
        dhuhrAdhan:    data.dhuhrAdhan,
        dhuhrIqamah:   data.dhuhrIqamah ?? null,
        asrAdhan:      data.asrAdhan,
        asrIqamah:     data.asrIqamah ?? null,
        maghribAdhan:  data.maghribAdhan,
        maghribIqamah: data.maghribIqamah ?? null,
        ishaAdhan:     data.ishaAdhan,
        ishaIqamah:    data.ishaIqamah ?? null,
        jummahTimes:   sql`${JSON.stringify(data.jummahTimes ?? [])}::jsonb`,
        updatedAt:     now,
      },
    })
    .returning();

  return mapScheduleRow(rows[0]);
}

export async function getPrayerSchedule(
  mosqueId: string,
): Promise<PrayerSchedule | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(prayerSchedules)
    .where(eq(prayerSchedules.mosqueId, mosqueId))
    .limit(1);
  return rows[0] ? mapScheduleRow(rows[0]) : undefined;
}
