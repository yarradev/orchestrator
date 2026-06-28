import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

describe("decide skeleton (P2b-1 T1)", () => {
  it("noops on a terminal stage (corpus case 17)", () => {
    const d = decide(card({ stage: "done" }), LC, NOW);
    expect(d.action).toBe("noop");
    expect(d.ops).toEqual([]);
    expect(d.reason).toMatch(/terminal/);
  });

  it("escalates an unknown stage", () => {
    const d = decide(card({ stage: "bogus" }), LC, NOW);
    expect(d.action).toBe("escalate");
    expect(d.reason).toMatch(/unknown.*stage/i);
  });

  it("routes epics through the epic lifecycle", () => {
    const d = decide(card({ type: "epic", stage: "done" }), LC, NOW);
    expect(d.action).toBe("noop"); // epic_stages.done is terminal
  });
});
