import { describe, expect, it } from "vitest";
import { computeStreak, lastNDays } from "@/lib/stats";

const tz = "Europe/Budapest";
const now = new Date("2026-11-18T10:00:00Z");

describe("computeStreak", () => {
  it("counts consecutive days including today", () => {
    const dates = ["2026-11-18T08:00:00Z", "2026-11-17T08:00:00Z", "2026-11-16T20:00:00Z", "2026-11-14T08:00:00Z"].map((d) => new Date(d));
    expect(computeStreak(dates, tz, now)).toBe(3);
  });
  it("keeps yesterday's streak alive before studying today", () => {
    expect(computeStreak([new Date("2026-11-17T08:00:00Z"), new Date("2026-11-16T08:00:00Z")], tz, now)).toBe(2);
  });
  it("is zero after a missed day", () => {
    expect(computeStreak([new Date("2026-11-15T08:00:00Z")], tz, now)).toBe(0);
  });
  it("uses the user's time zone for day boundaries", () => {
    // 23:30 UTC on the 17th is already the 18th in Budapest.
    expect(computeStreak([new Date("2026-11-17T23:30:00Z")], tz, now)).toBe(1);
  });
});

describe("lastNDays", () => {
  it("buckets minutes per local day", () => {
    const res = lastNDays([{ started_at: "2026-11-18T07:00:00Z", duration_seconds: 1800 }, { started_at: "2026-11-12T07:00:00Z", duration_seconds: 600 }], tz, 7, now);
    expect(res).toHaveLength(7);
    expect(res[6]).toEqual({ key: "2026-11-18", minutes: 30 });
    expect(res[0]).toEqual({ key: "2026-11-12", minutes: 10 });
  });
});
