export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

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
