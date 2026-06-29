import { describe, it, expect } from "vitest";
import * as core from "../src/index.js";

describe("@yarradev/core P2b-2 exports", () => {
  it("exposes reduceVerdict + the advisor glob helpers", () => {
    expect(typeof core.reduceVerdict).toBe("function");
    expect(typeof core.watchMatch).toBe("function");
    expect(typeof core.globToRegExp).toBe("function");
  });
});
