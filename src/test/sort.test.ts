import { describe, expect, it } from "vitest";

import { sortRows } from "@/lib/wantlist-sort";

const row = (artist: string, title: string, year: number | null, change_status = "unchanged") =>
  ({ artist, title, year, change_status });

describe("sortRows", () => {
  it("orders by artist name ascending by default", () => {
    const rows = [row("Zappa", "A", 1979), row("Abbott", "B", 1970)];
    expect(sortRows(rows, "artist").map((r) => r.artist)).toEqual(["Abbott", "Zappa"]);
  });

  it("orders by album title ascending by default", () => {
    const rows = [row("Zappa", "Zelda", 1979), row("Abbott", "Alpha", 1970)];
    expect(sortRows(rows, "title").map((r) => r.title)).toEqual(["Alpha", "Zelda"]);
  });

  it("orders by artist name descending when asked", () => {
    const rows = [row("Abbott", "B", 1970), row("Zappa", "A", 1979), row("Costello", "C", 1978)];
    expect(sortRows(rows, "artist", "desc").map((r) => r.artist)).toEqual(["Zappa", "Costello", "Abbott"]);
  });

  it("orders by album title descending when asked", () => {
    const rows = [row("Abbott", "Alpha", 1970), row("Zappa", "Zelda", 1979), row("Costello", "Mid", 1978)];
    expect(sortRows(rows, "title", "desc").map((r) => r.title)).toEqual(["Zelda", "Mid", "Alpha"]);
  });

  it("orders by release year oldest first ascending, unknown years last", () => {
    const rows = [row("New", "N", 2024), row("Old", "O", 1970), row("Unknown", "U", null)];
    expect(sortRows(rows, "year").map((r) => r.year)).toEqual([1970, 2024, null]);
  });

  it("orders by release year newest first descending, unknown years last", () => {
    const rows = [row("Old", "O", 1970), row("New", "N", 2024), row("Unknown", "U", null)];
    expect(sortRows(rows, "year", "desc").map((r) => r.year)).toEqual([2024, 1970, null]);
  });

  it("keeps newly available items above the rest in either direction", () => {
    const rows = [row("Abbott", "B", 1970), row("Zappa", "A", 1979, "now_available")];
    expect(sortRows(rows, "artist", "desc").map((r) => r.artist)).toEqual(["Zappa", "Abbott"]);
    expect(sortRows(rows, "artist", "asc").map((r) => r.artist)).toEqual(["Zappa", "Abbott"]);
  });
});
