import { describe, it, expect } from "vitest";
import { computeChangeStatus } from "./wantlist.functions";

describe("computeChangeStatus", () => {
  it("first run is baseline", () => expect(computeChangeStatus(null, 3)).toBe("unchanged"));
  it("0 -> >0 is now_available", () => expect(computeChangeStatus(0, 2)).toBe("now_available"));
  it(">0 -> 0 is no_longer_available", () => expect(computeChangeStatus(4, 0)).toBe("no_longer_available"));
  it(">0 -> >0 unchanged", () => expect(computeChangeStatus(1, 5)).toBe("unchanged"));
});
