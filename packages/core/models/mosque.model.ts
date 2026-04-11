export type MosqueFacility =
  | "parking"
  | "wheelchair_access"
  | "womens_area"
  | "wudu_area"
  | "funeral_services"
  | "islamic_school"
  | "library"
  | "community_hall";

export type MosqueVerificationStatus = "pending" | "verified" | "rejected";

export type MosqueClaimStatus = "unclaimed" | "claimed";

export interface Mosque {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  lat: number;
  lng: number;
  timezone: string;
  facilities: MosqueFacility[];
  source: string;
  sourceId: string | null;
  claimStatus: MosqueClaimStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  verificationStatus: MosqueVerificationStatus;
  logoUrl: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MosqueSourceRecord {
  id: string;
  mosqueId: string;
  source: string;
  sourceId: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MosqueClaimRecord {
  id: string;
  mosqueId: string;
  claimStatus: MosqueClaimStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
