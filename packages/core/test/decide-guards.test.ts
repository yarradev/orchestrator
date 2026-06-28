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

describe("decide budgets (P2b-1 T3, corpus cases 14,15)", () => {
  it("escalates when the transition budget is exceeded", () => {
    const c = card({ stage: "design", counters: { transitions: 12, bounces: {} } });
    expect(decide(c, LC, NOW)).toMatchObject({ action: "escalate", reason: expect.stringMatching(/transition budget/) });
  });
  it("escalates when a bounce limit is exceeded", () => {
    const c = card({ stage: "development", counters: { transitions: 2, bounces: { "testing->development": 3 } } });
    expect(decide(c, LC, NOW)).toMatchObject({ action: "escalate", reason: expect.stringMatching(/bounce limit/) });
  });
});
