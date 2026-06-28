import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

describe("decide dispatch owner (P2b-1 T9)", () => {
  it("spawns the designer for a fresh design card (case 0)", () => {
    const d = decide(card({ stage: "design", epoch: 0 }), LC, NOW);
    expect(d.action).toBe("spawn");
    expect(d.dispatch).toMatchObject({ role: "designer", epoch: 1, mode: "judgement", respawn: false });
  });
  it("spawns the developer for a mechanical stage with no PR yet (case 44)", () => {
    const d = decide(card({ stage: "development", epoch: 1, pr: null }), LC, NOW);
    expect(d.dispatch).toMatchObject({ role: "developer", mode: "mechanical", respawn: false });
  });
  it("uses the durable epoch high-water after a clean release (case 18 → claim @2)", () => {
    // design advanced to development (lease cleared), epoch high-water is 1 → next claim is 2
    const d = decide(card({ stage: "development", epoch: 1, lease: null, pr: null }), LC, NOW);
    expect(d.dispatch?.epoch).toBe(2);
  });
  it("re-spawns the developer on CI failure as a respawn (case 7)", () => {
    const d = decide(card({ stage: "development", epoch: 1, pr: { number: 9, head: "x", files: [] }, checks: { ci: "failure" } }), LC, NOW);
    expect(d.action).toBe("spawn");
    expect(d.dispatch).toMatchObject({ role: "developer", mode: "mechanical", respawn: true });
  });
});
