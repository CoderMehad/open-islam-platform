import { eq, and, or, sql, asc, count } from "drizzle-orm";
import { getDb } from "../adapters/neon.adapter.js";
import { admins, mosqueClaims, mosqueSources, mosques, prayerSchedules } from "../schemas/drizzle.schema.js";
import type {
  Mosque,
  MosqueClaimRecord,
  MosqueClaimStatus,
  MosqueFacility,
  MosqueSourceRecord,
  MosqueVerificationStatus,
  PrayerSchedule,
} from "../models/mosque.model.js";
import type { PaginatedResult } from "../models/shared.model.js";
import { slugify } from "../shared/helpers.js";
import { ConflictError } from "../errors.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

// ── Row Mapper ────────────────────────────────────────────────────────────────

function mapMosqueRow(
  row: typeof mosques.$inferSelect,
  schedule?: typeof prayerSchedules.$inferSelect | null,
): Mosque {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    city: row.city,
    postcode: row.postcode,
    country: row.country,
    // Omit phone/email when null so they're absent from the JSON response
    ...(row.phone  ? { phone:  row.phone  } : {}),
    ...(row.email  ? { email:  row.email  } : {}),
    website: row.website ?? null,
    lat: row.lat,
    lng: row.lng,
    timezone: row.timezone,
    facilities: JSON.parse(row.facilities) as MosqueFacility[],
    source: row.source,
    sourceId: row.sourceId ?? null,
    claimStatus: row.claimStatus as MosqueClaimStatus,
    claimedBy: row.claimedBy ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    verificationStatus: row.verificationStatus as MosqueVerificationStatus,
    isPublished: row.isPublished,
    logoUrl: row.logoUrl ?? null,
    coverUrl: row.coverUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    prayerSchedule: schedule ? mapPrayerScheduleRow(schedule) : null,
  };
}

function mapPrayerScheduleRow(row: typeof prayerSchedules.$inferSelect): PrayerSchedule {
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
    jummahTimes:   row.jummahTimes as PrayerSchedule["jummahTimes"],
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
  };
}

function mapMosqueSourceRow(
  row: typeof mosqueSources.$inferSelect,
): MosqueSourceRecord {
  return {
    id: row.id,
    mosqueId: row.mosqueId,
    source: row.source,
    sourceId: row.sourceId,
    rawPayload: row.rawPayload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMosqueClaimRow(
  row: typeof mosqueClaims.$inferSelect,
): MosqueClaimRecord {
  return {
    id: row.id,
    mosqueId: row.mosqueId,
    claimStatus: row.claimStatus as MosqueClaimStatus,
    claimedBy: row.claimedBy ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveUniqueSlug(
  baseName: string,
  excludeMosqueId?: string,
): Promise<string> {
  const db = getDb();
  const baseSlug = slugify(baseName);

  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const existing = await db
      .select({ id: mosques.id })
      .from(mosques)
      .where(eq(mosques.slug, candidate))
      .limit(1);

    if (!existing[0] || existing[0].id === excludeMosqueId) {
      return candidate;
    }
  }

  throw new ConflictError("Unable to generate a unique mosque slug");
}

// ── Queries ───────────────────────────────────────────────────────────────────

export interface ListMosquesParams {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  country?: string;
  facilities?: MosqueFacility[];
  source?: string;
  claimStatus?: MosqueClaimStatus;
}

export async function listMosques(
  params: ListMosquesParams = {},
): Promise<PaginatedResult<Mosque>> {
  const db = getDb();
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const conditions = [
    eq(mosques.verificationStatus, "verified"),
    eq(mosques.isPublished, true),
  ];

  if (params.q) {
    const search = `%${params.q.toLowerCase()}%`;
    conditions.push(
      sql`(
        lower(${mosques.name}) like ${search}
        or lower(${mosques.city}) like ${search}
        or lower(${mosques.postcode}) like ${search}
      )`,
    );
  }

  if (params.city) {
    conditions.push(sql`lower(${mosques.city}) = lower(${params.city})`);
  }

  if (params.country) {
    conditions.push(sql`lower(${mosques.country}) = lower(${params.country})`);
  }

  if (params.source) {
    conditions.push(sql`lower(${mosques.source}) = lower(${params.source})`);
  }

  if (params.claimStatus) {
    conditions.push(eq(mosques.claimStatus, params.claimStatus));
  }

  if (params.facilities && params.facilities.length > 0) {
    for (const facility of params.facilities) {
      conditions.push(sql`${mosques.facilities}::jsonb ? ${facility}`);
    }
  }

  const whereClause = and(...conditions);
  const orderBy = params.q
    ? [
        sql`case
          when lower(${mosques.name}) = lower(${params.q}) then 0
          when lower(${mosques.name}) like lower(${params.q} || '%') then 1
          when lower(${mosques.city}) = lower(${params.q}) then 2
          when lower(${mosques.postcode}) = lower(${params.q}) then 3
          else 4
        end`,
        asc(mosques.name),
        asc(mosques.city),
        asc(mosques.id),
      ]
    : [asc(mosques.name), asc(mosques.city), asc(mosques.id)];

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(mosques)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(mosques)
      .where(whereClause),
  ]);

  const total = Number(countResult[0].total);
  const totalPages = Math.ceil(total / limit);

  return {
    data: rows.map((row) => mapMosqueRow(row)),
    page,
    limit,
    total,
    totalPages,
  };
}

export async function listAllMosques(params: {
  page?: number;
  limit?: number;
  status?: string;
} = {}): Promise<PaginatedResult<Mosque>> {
  const db = getDb();
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const conditions = params.status
    ? [eq(mosques.verificationStatus, params.status)]
    : [];

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(mosques).where(whereClause)
      .orderBy(asc(mosques.createdAt), asc(mosques.id))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(mosques).where(whereClause),
  ]);

  const total = Number(countResult[0].total);
  return {
    data: rows.map((row) => mapMosqueRow(row)),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getMosqueByIdOrSlug(
  idOrSlug: string,
): Promise<Mosque | undefined> {
  const db = getDb();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrSlug,
    );
  const idCondition = isUuid
    ? or(eq(mosques.id, idOrSlug), eq(mosques.slug, idOrSlug))
    : eq(mosques.slug, idOrSlug);

  const rows = await db
    .select()
    .from(mosques)
    .leftJoin(prayerSchedules, eq(prayerSchedules.mosqueId, mosques.id))
    .where(and(idCondition, eq(mosques.verificationStatus, "verified"), eq(mosques.isPublished, true)))
    .limit(1);

  if (!rows[0]) return undefined;
  return mapMosqueRow(rows[0].mosques, rows[0].prayer_schedules);
}

/** Super-admin lookup: returns mosque + schedule regardless of verification/visibility. Accepts id or slug. */
export async function getMosqueByIdForAdmin(
  idOrSlug: string,
): Promise<Mosque | undefined> {
  const db = getDb();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const idCondition = isUuid
    ? or(eq(mosques.id, idOrSlug), eq(mosques.slug, idOrSlug))
    : eq(mosques.slug, idOrSlug);

  const rows = await db
    .select()
    .from(mosques)
    .leftJoin(prayerSchedules, eq(prayerSchedules.mosqueId, mosques.id))
    .where(idCondition)
    .limit(1);

  if (!rows[0]) return undefined;
  return mapMosqueRow(rows[0].mosques, rows[0].prayer_schedules);
}

export async function nearbyMosques(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
): Promise<Array<Mosque & { distance_km: number }>> {
  const db = getDb();
  const radiusMeters = radiusKm * 1000;

  const rows = await db.execute(sql`
    SELECT *,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${mosques.lng}, ${mosques.lat}), 4326)::geography
      ) / 1000.0 AS distance_km
    FROM mosques
    WHERE verification_status = 'verified'
      AND is_published = true
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(${mosques.lng}, ${mosques.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY distance_km ASC
    LIMIT ${limit}
  `);

  return (rows as unknown as Array<typeof mosques.$inferSelect & { distance_km: number }>).map((row) => ({
    ...mapMosqueRow(row),
    distance_km: Math.round(Number(row.distance_km) * 100) / 100,
  }));
}

export async function insertMosque(data: {
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  lat: number;
  lng: number;
  timezone?: string;
  facilities?: MosqueFacility[];
  source?: string;
  sourceId?: string | null;
  claimStatus?: MosqueClaimStatus;
  verificationStatus?: MosqueVerificationStatus;
}): Promise<Mosque> {
  const db = getDb();
  try {
    const slug = await resolveUniqueSlug(data.name);
    const rows = await db
      .insert(mosques)
      .values({
        slug,
        name: data.name,
        address: data.address,
        city: data.city,
        postcode: data.postcode,
        country: data.country,
        phone: data.phone ?? null,
        email: data.email ?? null,
        website: data.website ?? null,
        lat: data.lat,
        lng: data.lng,
        timezone: data.timezone ?? "UTC",
        facilities: JSON.stringify(data.facilities ?? []),
        source: data.source ?? "manual",
        sourceId: data.sourceId ?? null,
        claimStatus: data.claimStatus ?? "unclaimed",
        verificationStatus: data.verificationStatus ?? "pending",
      })
      .returning();

    return mapMosqueRow(rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique")) {
      throw new ConflictError("A mosque with this name (slug) already exists");
    }
    throw err;
  }
}

export async function updateMosque(
  id: string,
  data: {
    name?: string;
    address?: string;
    city?: string;
    postcode?: string;
    country?: string;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    lat?: number;
    lng?: number;
    timezone?: string;
    facilities?: MosqueFacility[];
    logoUrl?: string | null;
    coverUrl?: string | null;
    source?: string;
    sourceId?: string | null;
    claimStatus?: MosqueClaimStatus;
    claimedBy?: string | null;
    claimedAt?: Date | null;
    verificationStatus?: MosqueVerificationStatus;
  },
): Promise<Mosque | undefined> {
  const db = getDb();

  const updates: Partial<typeof mosques.$inferInsert> = { updatedAt: new Date() };

  if (data.name !== undefined) {
    updates.name = data.name;
    updates.slug = await resolveUniqueSlug(data.name, id);
  }
  if (data.address !== undefined) updates.address = data.address;
  if (data.city !== undefined) updates.city = data.city;
  if (data.postcode !== undefined) updates.postcode = data.postcode;
  if (data.country !== undefined) updates.country = data.country;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.email !== undefined) updates.email = data.email;
  if (data.website !== undefined) updates.website = data.website;
  if (data.lat !== undefined) updates.lat = data.lat;
  if (data.lng !== undefined) updates.lng = data.lng;
  if (data.timezone !== undefined) updates.timezone = data.timezone;
  if (data.facilities !== undefined)
    updates.facilities = JSON.stringify(data.facilities);
  if (data.logoUrl !== undefined) updates.logoUrl = data.logoUrl;
  if (data.coverUrl !== undefined) updates.coverUrl = data.coverUrl;
  if (data.source !== undefined) updates.source = data.source;
  if (data.sourceId !== undefined) updates.sourceId = data.sourceId;
  if (data.claimStatus !== undefined) updates.claimStatus = data.claimStatus;
  if (data.claimedBy !== undefined) updates.claimedBy = data.claimedBy;
  if (data.claimedAt !== undefined) updates.claimedAt = data.claimedAt;
  if (data.verificationStatus !== undefined)
    updates.verificationStatus = data.verificationStatus;

  try {
    const rows = await db
      .update(mosques)
      .set(updates)
      .where(eq(mosques.id, id))
      .returning();

    return rows[0] ? mapMosqueRow(rows[0]) : undefined;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique")) {
      throw new ConflictError("A mosque with this name (slug) already exists");
    }
    throw err;
  }
}

export async function deleteMosque(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(mosques)
    .where(eq(mosques.id, id))
    .returning({ id: mosques.id });

  return rows.length > 0;
}

export async function updateMosqueVerificationStatus(
  id: string,
  status: MosqueVerificationStatus,
): Promise<Mosque | undefined> {
  const db = getDb();
  const rows = await db
    .update(mosques)
    .set({ verificationStatus: status, updatedAt: new Date() })
    .where(eq(mosques.id, id))
    .returning();

  return rows[0] ? mapMosqueRow(rows[0]) : undefined;
}

export async function updateMosqueVisibility(
  id: string,
  isPublished: boolean,
): Promise<Mosque | undefined> {
  const db = getDb();
  const rows = await db
    .update(mosques)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(mosques.id, id))
    .returning();

  return rows[0] ? mapMosqueRow(rows[0]) : undefined;
}

export async function updateMosqueClaimStatus(
  id: string,
  claimStatus: MosqueClaimStatus,
  claimedBy?: string | null,
): Promise<Mosque | undefined> {
  const db = getDb();
  const claimedAt = claimStatus === "claimed" ? new Date() : null;
  const rows = await db
    .update(mosques)
    .set({
      claimStatus,
      claimedBy: claimStatus === "claimed" ? claimedBy ?? null : null,
      claimedAt,
      updatedAt: new Date(),
    })
    .where(eq(mosques.id, id))
    .returning();

  return rows[0] ? mapMosqueRow(rows[0]) : undefined;
}

export async function getMosqueWithAdminEmail(
  mosqueId: string,
): Promise<{ mosque: Mosque; adminEmail: string; adminName: string } | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mosques)
    .innerJoin(admins, eq(admins.mosqueId, mosques.id))
    .where(eq(mosques.id, mosqueId))
    .limit(1);

  if (!rows[0]) return undefined;
  return {
    mosque: mapMosqueRow(rows[0].mosques),
    adminEmail: rows[0].admins.email,
    adminName: rows[0].admins.name,
  };
}

export interface UpsertImportedMosqueData {
  source: string;
  sourceId: string;
  rawPayload: Record<string, unknown>;
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  lat: number;
  lng: number;
  timezone?: string;
  facilities?: MosqueFacility[];
}

export async function upsertImportedMosque(
  data: UpsertImportedMosqueData,
): Promise<{ mosque: Mosque; sourceRecord: MosqueSourceRecord; action: "inserted" | "updated" }> {
  const db = getDb();
  const existingSource = await db
    .select()
    .from(mosqueSources)
    .where(
      and(
        eq(mosqueSources.source, data.source),
        eq(mosqueSources.sourceId, data.sourceId),
      ),
    )
    .limit(1);

  if (existingSource[0]) {
    const updatedMosque = await updateMosque(existingSource[0].mosqueId, {
      name: data.name,
      address: data.address,
      city: data.city,
      postcode: data.postcode,
      country: data.country,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      lat: data.lat,
      lng: data.lng,
      timezone: data.timezone ?? "UTC",
      facilities: data.facilities ?? [],
      source: data.source,
      sourceId: data.sourceId,
      claimStatus: "unclaimed",
      claimedBy: null,
      claimedAt: null,
      verificationStatus: "verified",
    });

    if (!updatedMosque) {
      throw new Error("Imported mosque source points to a missing mosque record");
    }

    const sourceRows = await db
      .update(mosqueSources)
      .set({ rawPayload: data.rawPayload, updatedAt: new Date() })
      .where(eq(mosqueSources.id, existingSource[0].id))
      .returning();

    return {
      mosque: updatedMosque,
      sourceRecord: mapMosqueSourceRow(sourceRows[0]),
      action: "updated",
    };
  }

  const existingMosque = await db
    .select()
    .from(mosques)
    .where(
      and(
        eq(mosques.source, data.source),
        eq(mosques.sourceId, data.sourceId),
      ),
    )
    .limit(1);

  if (existingMosque[0]) {
    const updatedMosque = await updateMosque(existingMosque[0].id, {
      name: data.name,
      address: data.address,
      city: data.city,
      postcode: data.postcode,
      country: data.country,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      lat: data.lat,
      lng: data.lng,
      timezone: data.timezone ?? "UTC",
      facilities: data.facilities ?? [],
      source: data.source,
      sourceId: data.sourceId,
      claimStatus: "unclaimed",
      claimedBy: null,
      claimedAt: null,
      verificationStatus: "verified",
    });

    if (!updatedMosque) {
      throw new Error("Imported mosque identity points to a missing canonical mosque record");
    }

    const sourceRows = await db
      .insert(mosqueSources)
      .values({
        mosqueId: updatedMosque.id,
        source: data.source,
        sourceId: data.sourceId,
        rawPayload: data.rawPayload,
      })
      .onConflictDoUpdate({
        target: [mosqueSources.source, mosqueSources.sourceId],
        set: {
          mosqueId: updatedMosque.id,
          rawPayload: data.rawPayload,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      mosque: updatedMosque,
      sourceRecord: mapMosqueSourceRow(sourceRows[0]),
      action: "updated",
    };
  }

  const mosque = await insertMosque({
    name: data.name,
    address: data.address,
    city: data.city,
    postcode: data.postcode,
    country: data.country,
    phone: data.phone ?? null,
    email: data.email ?? null,
    website: data.website ?? null,
    lat: data.lat,
    lng: data.lng,
    timezone: data.timezone ?? "UTC",
    facilities: data.facilities ?? [],
    source: data.source,
    sourceId: data.sourceId,
    claimStatus: "unclaimed",
    verificationStatus: "verified",
  });

  const sourceRows = await db
    .insert(mosqueSources)
    .values({
      mosqueId: mosque.id,
      source: data.source,
      sourceId: data.sourceId,
      rawPayload: data.rawPayload,
    })
    .returning();

  return {
    mosque,
    sourceRecord: mapMosqueSourceRow(sourceRows[0]),
    action: "inserted",
  };
}

export async function getMosqueProvenance(
  mosqueId: string,
): Promise<{ mosque: Mosque; sources: MosqueSourceRecord[]; claims: MosqueClaimRecord[] } | undefined> {
  const db = getDb();
  const [mosqueRows, sourceRows, claimRows] = await Promise.all([
    db.select().from(mosques).where(eq(mosques.id, mosqueId)).limit(1),
    db
      .select()
      .from(mosqueSources)
      .where(eq(mosqueSources.mosqueId, mosqueId))
      .orderBy(asc(mosqueSources.createdAt)),
    db
      .select()
      .from(mosqueClaims)
      .where(eq(mosqueClaims.mosqueId, mosqueId))
      .orderBy(asc(mosqueClaims.createdAt)),
  ]);

  if (!mosqueRows[0]) return undefined;

  return {
    mosque: mapMosqueRow(mosqueRows[0]),
    sources: sourceRows.map(mapMosqueSourceRow),
    claims: claimRows.map(mapMosqueClaimRow),
  };
}

export async function createMosqueClaimRecord(data: {
  mosqueId: string;
  claimStatus?: MosqueClaimStatus;
  claimedBy?: string | null;
  claimedAt?: Date | null;
  notes?: string | null;
}): Promise<MosqueClaimRecord> {
  const db = getDb();
  const rows = await db
    .insert(mosqueClaims)
    .values({
      mosqueId: data.mosqueId,
      claimStatus: data.claimStatus ?? "unclaimed",
      claimedBy: data.claimedBy ?? null,
      claimedAt: data.claimedAt ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  return mapMosqueClaimRow(rows[0]);
}
