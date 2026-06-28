import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

describe("decide malformed (P2b-1 T2, corpus case 16)", () => {
  it("escalates a malformed card and never advances it", () => {
    const d = decide(card({ stage: "design", malformed: ["two stage labels"] }), LC, NOW);
    expect(d.action).toBe("escalate");
    expect(d.reason).toMatch(/malformed/);
    expect(d.ops.some((o) => o.kind === "setOverlay" && o.overlay === "escalated" && o.on)).toBe(true);
    expect(d.ops.some((o) => o.kind === "note")).toBe(true);
  });

  it("ignores an empty malformed list", () => {
    const d = decide(card({ stage: "design", malformed: [] }), LC, NOW);
    expect(d.action).not.toBe("escalate");
  });
});
