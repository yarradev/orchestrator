import { describe, it, expect } from "vitest";
import { reduceVerdict } from "../src/reduce.js";
import { LC, card } from "./fixtures/lifecycle.js";

describe("reduceVerdict advance (P2b-2 T2, corpus cases 1/32/45)", () => {
  it("advances a judgement stage along its single forward edge (corpus case 1)", () => {
    const ops = reduceVerdict(card({ stage: "design" }), { status: "advance", to: "development" }, LC);
    expect(ops.some((o) => o.kind === "setStage" && o.from === "design" && o.to === "development")).toBe(true);
    expect(ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
  it("advances an epic through the epic lifecycle (corpus case 32)", () => {
    const ops = reduceVerdict(card({ type: "epic", stage: "analysis" }), { status: "advance", to: "decompose" }, LC);
    expect(ops.some((o) => o.kind === "setStage" && o.to === "decompose")).toBe(true);
  });
  it("escalates a MOVE that names the wrong to-stage (corpus case 45)", () => {
    const ops = reduceVerdict(card({ stage: "design" }), { status: "advance", to: "testing" }, LC);
    expect(ops.some((o) => o.kind === "setOverlay" && o.overlay === "escalated")).toBe(true);
    expect(ops.some((o) => o.kind === "setStage")).toBe(false);
  });
  it("adds a close op when advancing into a terminal stage", () => {
    const ops = reduceVerdict(card({ stage: "testing" }), { status: "advance", to: "done" }, LC);
    expect(ops.some((o) => o.kind === "setStage" && o.to === "done")).toBe(true);
    expect(ops.some((o) => o.kind === "close")).toBe(true);
  });
  it("advances along the single forward edge when `to` is omitted", () => {
    const ops = reduceVerdict(card({ stage: "design" }), { status: "advance" }, LC);
    expect(ops.some((o) => o.kind === "setStage" && o.to === "development")).toBe(true);
  });
});
