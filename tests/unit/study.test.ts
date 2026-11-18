import { describe, expect, it } from "vitest";
import { checkObjective } from "@/lib/ai/study";
import { estimateSegments, splitSentences } from "@/lib/stt/whisper";
import { cleanText, extractText } from "@/lib/documents/extract";

describe("checkObjective", () => {
  it("matches multiple-choice answers ignoring case and spacing", () => {
    expect(checkObjective("multiple_choice", "Mitokondrium", " mitokondrium ")).toBe(true);
    expect(checkObjective("multiple_choice", "Mitokondrium", "Sejtmag")).toBe(false);
    expect(checkObjective("multiple_choice", "A", null)).toBe(false);
  });
  it("handles true/false in both languages", () => {
    expect(checkObjective("true_false", "true", "true")).toBe(true);
    expect(checkObjective("true_false", "true", "igaz")).toBe(true);
    expect(checkObjective("true_false", "false", "true")).toBe(false);
    expect(checkObjective("true_false", "false", "false")).toBe(true);
  });
});

describe("estimated transcript timestamps", () => {
  it("splits Hungarian sentences", () => {
    expect(splitSentences("A sejt az élet alapegysége. Ma a sejtlégzésről lesz szó! Érthető?")).toEqual([
      "A sejt az élet alapegysége.",
      "Ma a sejtlégzésről lesz szó!",
      "Érthető?",
    ]);
  });
  it("spreads sentences over the segment duration in order", () => {
    const segs = estimateSegments("Első mondat itt. Második, kicsit hosszabb mondat itt van.", 60);
    expect(segs).toHaveLength(2);
    expect(segs[0].start).toBe(0);
    expect(segs[1].start).toBeGreaterThan(0);
    expect(segs[1].end).toBeCloseTo(60, 0);
    expect(segs[0].end).toBeLessThan(segs[1].end);
  });
  it("returns nothing for empty text", () => {
    expect(estimateSegments("", 30)).toEqual([]);
  });
});

describe("document text", () => {
  it("normalises whitespace but keeps paragraphs", () => {
    expect(cleanText("Cím\r\n\r\n\r\n  Első   sor\t vége \n második")).toBe("Cím\n\nElső sor vége\nmásodik");
  });
  it("reads plain text files as UTF-8", async () => {
    const data = new TextEncoder().encode("Árvíztűrő tükörfúrógép").buffer as ArrayBuffer;
    expect(await extractText(data, "text/plain")).toBe("Árvíztűrő tükörfúrógép");
  });
  it("rejects unsupported types", async () => {
    await expect(extractText(new ArrayBuffer(4), "image/png")).rejects.toThrow("UNSUPPORTED_TYPE");
  });
});
