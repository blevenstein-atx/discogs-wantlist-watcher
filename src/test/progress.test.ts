import { describe, expect, it } from "vitest";

import { progressOf } from "@/lib/wantlist-progress";

describe("progressOf", () => {
  it("stays in reading phase until the wantlist size is known", () => {
    expect(progressOf(null)).toEqual({ phase: "reading", done: 0, total: null, percent: null });
    expect(progressOf({ total: null, checked: 0 })).toEqual({ phase: "reading", done: 0, total: null, percent: null });
    expect(progressOf({ total: 0, checked: 0 })).toEqual({ phase: "reading", done: 0, total: null, percent: null });
  });

  it("reports checked of total once the size is known", () => {
    expect(progressOf({ total: 200, checked: 47 })).toEqual({ phase: "checking", done: 47, total: 200, percent: 24 });
    expect(progressOf({ total: 100, checked: 100 })).toEqual({ phase: "checking", done: 100, total: 100, percent: 100 });
  });

  it("never lets the bar run past 100%", () => {
    expect(progressOf({ total: 100, checked: 150 })).toEqual({ phase: "checking", done: 150, total: 100, percent: 100 });
  });
});
