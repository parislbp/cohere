import { describe, expect, it } from "vitest";
import { basename, dirname, extname, formatBytes, formatDayMonthYear, formatDaysAgo, formatDuration, formatRelative, joinPath, slugify } from "./format";

describe("format", () => {
  it("renders DD MM YYYY", () => {
    expect(formatDayMonthYear(new Date(2026, 8, 21, 10, 0))).toBe("21 09 2026");
    expect(formatDayMonthYear(new Date(2026, 0, 3))).toBe("03 01 2026");
    expect(formatDayMonthYear("not a date")).toBe("—");
    expect(formatDayMonthYear(null)).toBe("—");
  });

  it("relative times", () => {
    const now = new Date(2026, 8, 21, 12, 0, 0);
    expect(formatRelative(new Date(now.getTime() - 10_000), now)).toBe("just now");
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 h ago");
    expect(formatRelative(new Date(now.getTime() - 26 * 3_600_000), now)).toBe("yesterday");
    expect(formatRelative(new Date(now.getTime() - 6 * 86_400_000), now)).toBe("6 days ago");
    expect(formatRelative(new Date(2026, 0, 1), now)).toBe("01 01 2026");
  });

  it("days ago counts calendar days", () => {
    const now = new Date(2026, 8, 23, 9, 0);
    expect(formatDaysAgo(new Date(2026, 8, 23, 1, 0), now)).toBe("today");
    expect(formatDaysAgo(new Date(2026, 8, 22, 23, 59), now)).toBe("1 day ago");
    expect(formatDaysAgo(new Date(2026, 8, 1), now)).toBe("22 days ago");
    expect(formatDaysAgo(null)).toBe("—");
  });

  it("bytes and durations", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(402_000)).toBe("393 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(1900)).toBe("1.9 s");
    expect(formatDuration(65_000)).toBe("1 min 5 s");
  });

  it("paths", () => {
    expect(basename("chapters/ch_01.tex")).toBe("ch_01.tex");
    expect(dirname("chapters/ch_01.tex")).toBe("chapters");
    expect(dirname("main.tex")).toBe("");
    expect(extname("figures/plot.PNG")).toBe("png");
    expect(extname(".gitignore")).toBe("");
    expect(joinPath("", "a.tex")).toBe("a.tex");
    expect(joinPath("chapters/", "a.tex")).toBe("chapters/a.tex");
    expect(slugify("MTM v1.2 — Model")).toBe("mtm-v1-2-model");
  });
});
