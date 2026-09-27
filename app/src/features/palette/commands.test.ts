import { describe, expect, it } from "vitest";
import { filterCommands, fuzzyScore, type Command } from "./commands";

const mk = (id: string, title: string, keywords?: string): Command => ({ id, title, group: "editor", keywords, run: () => {} });

describe("command palette filter", () => {
  it("matches in-order characters and prefers prefixes and word starts", () => {
    expect(fuzzyScore("comp", "Compile")).not.toBeNull();
    expect(fuzzyScore("cmp", "Compile")).not.toBeNull();
    expect(fuzzyScore("xyz", "Compile")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
    expect(fuzzyScore("comp", "Compile")!).toBeGreaterThan(fuzzyScore("comp", "Show compile log")!);
  });

  it("ranks the best match first and searches keywords", () => {
    const cmds = [mk("a", "Show compile log"), mk("b", "Compile"), mk("c", "Toggle line numbers", "gutter"), mk("d", "Theme: Ink")];
    expect(filterCommands(cmds, "comp").map((c) => c.id)).toEqual(["b", "a"]);
    expect(filterCommands(cmds, "gutter").map((c) => c.id)).toEqual(["c"]);
    expect(filterCommands(cmds, "ink").map((c) => c.id)[0]).toBe("d");
    expect(filterCommands(cmds, "").length).toBe(4);
    expect(filterCommands(cmds, "zzzz")).toEqual([]);
  });
});
