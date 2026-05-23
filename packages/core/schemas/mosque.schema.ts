import { z } from "zod";

const facilityEnum = z.enum([
  "parking",
  "wheelchair_access",
  "womens_area",
  "wudu_area",
  "funeral_services",
  "islamic_school",
  "library",
  "community_hall",
]);

const claimStatusEnum = z.enum(["unclaimed", "claimed"]);
const verificationStatusEnum = z.enum(["pending", "verified", "rejected"]);

const csvList = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}, z.array(z.string()).optional());

export const createMosque = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  postcode: z.string().min(1).max(20),
  country: z.string().length(2),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(64).optional(),
  facilities: z.array(facilityEnum).optional(),
});

export const updateMosque = createMosque.partial();

const prayerScheduleResponse = z.object({
  fajrAdhan:     z.string(),
  fajrIqamah:    z.string().nullable(),
  dhuhrAdhan:    z.string(),
  dhuhrIqamah:   z.string().nullable(),
  asrAdhan:      z.string(),
  asrIqamah:     z.string().nullable(),
  maghribAdhan:  z.string(),
  maghribIqamah: z.string().nullable(),
  ishaAdhan:     z.string(),
  ishaIqamah:    z.string().nullable(),
  jummahTimes:   z.array(z.object({
    adhan:  z.string(),
    iqamah: z.string().nullable(),
  })),
});

export const mosqueResponse = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  postcode: z.string(),
  country: z.string(),
  // Omitted from response when null — only present when the mosque has published a public contact
  phone:   z.string().optional(),
  email:   z.string().optional(),
  website: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  timezone: z.string(),
  facilities: z.array(facilityEnum),
  source: z.string(),
  sourceId: z.string().nullable(),
  claimStatus: claimStatusEnum,
  claimedBy: z.string().nullable(),
  claimedAt: z.string().nullable(),
  verificationStatus: verificationStatusEnum,
  isPublished: z.boolean(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  prayerSchedule: prayerScheduleResponse.nullable(),
});

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  q: z.string().min(1).optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  facilities: csvList.pipe(z.array(facilityEnum).optional()),
  source: z.string().optional(),
  claim_status: claimStatusEnum.optional(),
});

export const nearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().min(0.1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
