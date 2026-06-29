import { describe, it, expect } from "vitest";
import { reduceVerdict } from "../src/reduce.js";
import { LC, card } from "./fixtures/lifecycle.js";

describe("reduceVerdict skeleton (P2b-2 T1)", () => {
  it("escalates on a worker error", () => {
    const ops = reduceVerdict(card({ stage: "design" }), { status: "error", reason: "boom" }, LC);
    expect(ops.some((o) => o.kind === "setOverlay" && o.overlay === "escalated" && o.on)).toBe(true);
    expect(ops.some((o) => o.kind === "note")).toBe(true);
  });
});
