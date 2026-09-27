import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "@/api/types";
import { filterProjects, paginate, rowsThatFit } from "./library";

const mk = (id: string, title: string, topic: string | null, modified: string, archived = false, favorite = false): ProjectSummary => ({
  id,
  title,
  topic,
  template: "project",
  created: modified,
  modified,
  archived,
  favorite,
  mainFile: "main.tex",
  engine: null,
  lastOpenedFile: null,
  hasOutput: false,
  fileCount: 3,
  versionCount: 0,
  sizeBytes: 10,
});

const all = [mk("a", "Alpha Model", "Energy", "2026-09-01T00:00:00Z", false, true), mk("b", "Beta Notes", null, "2026-09-10T00:00:00Z"), mk("c", "Gamma Brief", "Finance", "2026-09-05T00:00:00Z", true), mk("d", "Delta energy study", "Markets", "2026-09-07T00:00:00Z")];

describe("library filtering", () => {
  it("hides archived by default, newest first", () => {
    expect(filterProjects(all, "", false).map((p) => p.id)).toEqual(["b", "d", "a"]);
    expect(filterProjects(all, "", true).map((p) => p.id)).toEqual(["c"]);
  });
  it("matches title and topic, case-insensitive", () => {
    expect(filterProjects(all, "ENERGY", false).map((p) => p.id)).toEqual(["d", "a"]);
    expect(filterProjects(all, "notes", false).map((p) => p.id)).toEqual(["b"]);
    expect(filterProjects(all, "zzz", false)).toEqual([]);
  });
  it("filters favourites and non-favourites", () => {
    expect(filterProjects(all, "", false, "modified", "desc", "fav").map((p) => p.id)).toEqual(["a"]);
    expect(filterProjects(all, "", false, "modified", "desc", "nonfav").map((p) => p.id)).toEqual(["b", "d"]);
    expect(filterProjects(all, "", false, "modified", "desc", "all")).toHaveLength(3);
  });
  it("sorts by title and topic", () => {
    expect(filterProjects(all, "", false, "title", "asc").map((p) => p.id)).toEqual(["a", "b", "d"]);
    expect(filterProjects(all, "", false, "topic", "asc").map((p) => p.id)).toEqual(["b", "a", "d"]);
  });
});

describe("pagination", () => {
  it("fits rows without scrolling", () => {
    expect(rowsThatFit(500, 44)).toBe(11);
    expect(rowsThatFit(500, 44, 60)).toBe(10);
    expect(rowsThatFit(10, 44)).toBe(1);
  });
  it("clamps page and slices", () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(items, 1, 10)).toEqual({ slice: items.slice(0, 10), page: 1, pages: 3 });
    expect(paginate(items, 9, 10).page).toBe(3);
    expect(paginate(items, 3, 10).slice).toEqual([20, 21, 22]);
    expect(paginate([], 1, 10)).toEqual({ slice: [], page: 1, pages: 1 });
  });
});
