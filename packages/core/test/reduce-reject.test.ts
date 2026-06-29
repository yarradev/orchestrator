import { describe, it, expect } from "vitest";
import { reduceVerdict } from "../src/reduce.js";
import { LC, card } from "./fixtures/lifecycle.js";

describe("reduceVerdict reject (P2b-2 T3, corpus cases 10/20)", () => {
  it("rejects along a defined backward edge (corpus case 10)", () => {
    const ops = reduceVerdict(card({ stage: "testing" }), { status: "reject", to: "development" }, LC);
    const rj = ops.find((o) => o.kind === "reject");
    expect(rj).toMatchObject({ from: "testing", to: "development", edge: "testing->development" });
    expect(ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
  it("escalates a REJECT on an undefined backward edge (corpus case 20)", () => {
    const ops = reduceVerdict(card({ stage: "design" }), { status: "reject", to: "analysis" }, LC);
    expect(ops.some((o) => o.kind === "setOverlay" && o.overlay === "escalated")).toBe(true);
    expect(ops.some((o) => o.kind === "reject")).toBe(false);
  });
  it("escalates a REJECT with no to-stage", () => {
    const ops = reduceVerdict(card({ stage: "testing" }), { status: "reject" }, LC);
    expect(ops.some((o) => o.kind === "setOverlay" && o.overlay === "escalated")).toBe(true);
  });
});
