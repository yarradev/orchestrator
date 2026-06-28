import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const epic = (o: object) => card({ type: "epic", stage: "integrating", ...o });

describe("decide epic fan-in barrier (P2b-1 T6)", () => {
  it("advances when all children are done (case 36)", () => {
    const d = decide(epic({ children: { total: 3, done: 3 } }), LC, NOW);
    expect(d.action).toBe("advance");
    expect(d.ops.some((o) => o.kind === "setStage" && o.from === "integrating" && o.to === "done")).toBe(true);
    expect(d.ops.some((o) => o.kind === "close")).toBe(true); // next (done) is terminal
  });
  it("noops while children are incomplete (case 34)", () => {
    expect(decide(epic({ children: { total: 3, done: 1 } }), LC, NOW).action).toBe("noop");
  });
  it("escalates a 0-child barrier (case 35)", () => {
    expect(decide(epic({ children: { total: 0, done: 0 } }), LC, NOW).action).toBe("escalate");
  });
});
