import { describe, it, expect } from "vitest";
import * as core from "../src/index.js";

describe("@yarradev/core decide exports (P2b-1 T10)", () => {
  it("exposes decide + helpers", () => {
    expect(typeof core.decide).toBe("function");
    expect(typeof core.leaseExpired).toBe("function");
    expect(typeof core.currentEpoch).toBe("function");
  });
});
