export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface JummahSlot {
  adhan: string;
  iqamah: string | null;
}

export interface PrayerSchedule {
  mosqueId: string;
  fajrAdhan: string;
  fajrIqamah: string | null;
  dhuhrAdhan: string;
  dhuhrIqamah: string | null;
  asrAdhan: string;
  asrIqamah: string | null;
  maghribAdhan: string;
  maghribIqamah: string | null;
  ishaAdhan: string;
  ishaIqamah: string | null;
  jummahTimes: JummahSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface PrayerTimeSet {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  jummah: string | null;
}

export interface PrayerTimeEntry {
  id: string;
  mosqueId: string;
  date: string;
  adhan: PrayerTimeSet;
  iqamah: PrayerTimeSet;
  createdAt: string;
  updatedAt: string;
}
