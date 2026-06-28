import { describe, it, expect } from "vitest";
import * as core from "../src/index.js";

describe("@yarradev/core public exports (P2a)", () => {
  it("exposes the config loaders", () => {
    expect(typeof core.loadLifecycle).toBe("function");
    expect(typeof core.loadTeamPolicy).toBe("function");
  });
});
