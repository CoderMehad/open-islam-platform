import type {
  Mosque,
  MosqueClaimRecord,
  MosqueClaimStatus,
  MosqueFacility,
  MosqueSourceRecord,
} from "../models/mosque.model.js";
import type { PaginatedResult } from "../models/shared.model.js";
import { MAX_PAGE_SIZE } from "../constants.js";
import { ConflictError } from "../errors.js";
import { logger } from "../adapters/logger.adapter.js";
import {
  listMosques,
  getMosqueByIdOrSlug as dbGetByIdOrSlug,
  nearbyMosques,
  insertMosque,
  updateMosque as dbUpdateMosque,
  deleteMosque,
  createMosqueClaimRecord,
  getMosqueProvenance,
  getMosqueWithAdminEmail as dbGetMosqueWithAdminEmail,
  updateMosqueClaimStatus as dbUpdateMosqueClaimStatus,
  updateMosqueVerificationStatus as dbUpdateMosqueVerificationStatus,
  upsertImportedMosque,
} from "../repositories/mosque.repository.js";
import {
  getAdminById,
  linkAdminToMosque,
} from "../repositories/admin.repository.js";

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  country?: string;
  facilities?: MosqueFacility[];
  source?: string;
  claimStatus?: MosqueClaimStatus;
}

export interface NearbyParams {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}

export interface CreateMosqueData {
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
  facilities?: Mosque["facilities"];
  source?: string;
  sourceId?: string | null;
  claimStatus?: MosqueClaimStatus;
  verificationStatus?: Mosque["verificationStatus"];
}

export interface UpdateMosqueData {
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
  facilities?: Mosque["facilities"];
  logoUrl?: string | null;
  coverUrl?: string | null;
  source?: string;
  sourceId?: string | null;
  claimStatus?: MosqueClaimStatus;
  claimedBy?: string | null;
  verificationStatus?: Mosque["verificationStatus"];
}

export interface ImportedMosqueData {
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

export async function list(params: ListParams = {}): Promise<PaginatedResult<Mosque>> {
  const result = await listMosques(params);
  logger.info("Mosques listed", {
    source: "mosques",
    attributes: {
      q: params.q ?? null,
      city: params.city ?? null,
      country: params.country ?? null,
      sourceFilter: params.source ?? null,
      claimStatus: params.claimStatus ?? null,
      page: params.page ?? 1,
      total: result.total,
    },
  });
  return result;
}

export async function getByIdOrSlug(
  idOrSlug: string,
): Promise<Mosque | undefined> {
  return dbGetByIdOrSlug(idOrSlug);
}

export async function nearby(
  params: NearbyParams,
): Promise<Array<Mosque & { distance_km: number }>> {
  const radiusKm = params.radiusKm ?? 10;
  const limit = Math.min(params.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  return nearbyMosques(params.lat, params.lng, radiusKm, limit);
}

export async function create(
  data: CreateMosqueData,
  adminId: string,
): Promise<Mosque> {
  const admin = await getAdminById(adminId);
  if (admin?.mosqueId) {
    logger.warn("Mosque creation denied — admin already manages a mosque", { source: "mosques", attributes: { adminId, existingMosqueId: admin.mosqueId } });
    throw new ConflictError("You already manage a mosque");
  }

  const mosque = await insertMosque(data);
  await linkAdminToMosque(adminId, mosque.id);
  logger.info("Mosque created", { source: "mosques", attributes: { mosqueId: mosque.id, name: data.name, city: data.city, adminId } });
  return mosque;
}

export async function update(
  id: string,
  data: UpdateMosqueData,
): Promise<Mosque | undefined> {
  const result = await dbUpdateMosque(id, data);
  if (result) {
    logger.info("Mosque updated", { source: "mosques", attributes: { mosqueId: id, fields: Object.keys(data) } });
  }
  return result;
}

export async function updateClaimStatus(
  id: string,
  claimStatus: MosqueClaimStatus,
  claimedBy?: string | null,
  notes?: string | null,
): Promise<Mosque | undefined> {
  const result = await dbUpdateMosqueClaimStatus(id, claimStatus, claimedBy);
  if (result) {
    await createMosqueClaimRecord({
      mosqueId: id,
      claimStatus,
      claimedBy: claimStatus === "claimed" ? claimedBy ?? null : null,
      claimedAt: claimStatus === "claimed" ? new Date() : null,
      notes: notes ?? null,
    });
    logger.info("Mosque claim status updated", {
      source: "mosques",
      attributes: { mosqueId: id, claimStatus, claimedBy: claimedBy ?? null },
    });
  }
  return result;
}

export async function getProvenance(
  mosqueId: string,
): Promise<
  | {
      mosque: Mosque;
      sources: MosqueSourceRecord[];
      claims: MosqueClaimRecord[];
    }
  | undefined
> {
  return getMosqueProvenance(mosqueId);
}

export async function importCanonicalMosque(
  data: ImportedMosqueData,
): Promise<{ mosque: Mosque; sourceRecord: MosqueSourceRecord; action: "inserted" | "updated" }> {
  const result = await upsertImportedMosque(data);
  logger.info("Mosque import upsert completed", {
    source: "mosque-import",
    attributes: {
      mosqueId: result.mosque.id,
      source: data.source,
      sourceId: data.sourceId,
      action: result.action,
    },
  });
  return result;
}

export async function updateVerificationStatus(
  id: string,
  status: Mosque["verificationStatus"],
): Promise<Mosque | undefined> {
  const result = await dbUpdateMosqueVerificationStatus(id, status);
  if (result) {
    logger.info("Mosque verification status updated", {
      source: "mosques",
      attributes: { mosqueId: id, verificationStatus: status },
    });
  }
  return result;
}

export async function getWithAdminEmail(
  mosqueId: string,
): Promise<{ mosque: Mosque; adminEmail: string; adminName: string } | undefined> {
  return dbGetMosqueWithAdminEmail(mosqueId);
}

export async function remove(id: string): Promise<boolean> {
  const deleted = await deleteMosque(id);
  if (deleted) {
    logger.info("Mosque deleted", { source: "mosques", attributes: { mosqueId: id } });
  }
  return deleted;
}
