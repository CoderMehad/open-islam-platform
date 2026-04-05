import { describe, it, expect } from "vitest";
import { calculatePrayerTimes } from "./lib/prayer-calculation/prayer-times.js";
import { CALCULATION_METHODS, resolveMethod } from "./lib/prayer-calculation/methods.js";

describe("prayer-calculation", () => {
  describe("calculatePrayerTimes", () => {
    it("calculates prayer times for London, UK (MWL method)", () => {
      const result = calculatePrayerTimes(
        new Date("2024-06-15"),
        { latitude: 51.5074, longitude: -0.1278 },
        { method: "mwl" },
        "Europe/London",
      );

      expect(result.fajr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.dhuhr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.asr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.maghrib).toMatch(/^\d{2}:\d{2}$/);
      expect(result.isha).toMatch(/^\d{2}:\d{2}$/);
    });

    it("calculates prayer times for Makkah (Umm Al-Qura method)", () => {
      const result = calculatePrayerTimes(
        new Date("2024-06-15"),
        { latitude: 21.3891, longitude: 39.8579 },
        { method: "umm_al_qura" },
        "Asia/Riyadh",
      );

      expect(result.fajr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.dhuhr).toMatch(/^\d{2}:\d{2}$/);
    });

    it("applies manual adjustments correctly", () => {
      const withoutAdjustment = calculatePrayerTimes(
        new Date("2024-06-15"),
        { latitude: 51.5074, longitude: -0.1278 },
        { method: "mwl" },
        "Europe/London",
      );

      const withAdjustment = calculatePrayerTimes(
        new Date("2024-06-15"),
        { latitude: 51.5074, longitude: -0.1278 },
        { method: "mwl", adjustments: { fajr: 10, isha: -10 } },
        "Europe/London",
      );

      expect(withAdjustment.fajr).not.toBe(withoutAdjustment.fajr);
    });
  });

  describe("resolveMethod", () => {
    it("resolves valid method IDs", () => {
      const mwl = resolveMethod("mwl");
      expect(mwl.id).toBe("mwl");
      expect(mwl.name).toBe("Muslim World League");
    });

    it("returns custom params when provided", () => {
      const custom = { id: "custom", name: "Custom", fajrAngle: 15, isha: { type: "angle", degrees: 15 } };
      const result = resolveMethod(custom);
      expect(result.fajrAngle).toBe(15);
    });

    it("throws for unknown method IDs", () => {
      expect(() => resolveMethod("invalid_method")).toThrow();
    });
  });

  describe("CALCULATION_METHODS", () => {
    it("contains all expected methods", () => {
      expect(CALCULATION_METHODS.mwl).toBeDefined();
      expect(CALCULATION_METHODS.isna).toBeDefined();
      expect(CALCULATION_METHODS.umm_al_qura).toBeDefined();
      expect(CALCULATION_METHODS.karachi).toBeDefined();
    });
  });
});
