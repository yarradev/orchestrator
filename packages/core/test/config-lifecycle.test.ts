import { describe, it, expect } from "vitest";
import { loadLifecycle } from "../src/config.js";

const RAW = {
  entry_stage: "design",
  stages: {
    design: { owner_role: "designer", gate: "judgement", advance_on: "plan_posted", next: "development" },
    development: { owner_role: "developer", gate: "mechanical", advance_on: "ci_green", next: "testing" },
    testing: { owner_role: "tester", gate: "judgement", advance_on: "tests_green", next: "done" },
    done: { terminal: true },
  },
  backward_edges: {
    "development->design": { from: "development", to: "design" },
    "testing->development": { from: "testing", to: "development" },
  },
  epic_entry_stage: "analysis",
  epic_stages: {
    analysis: { owner_role: "analyst", gate: "judgement", advance_on: "brief_posted", next: "decompose" },
    integrating: { gate: "barrier", advance_on: "all_children_done", next: "done" },
    done: { terminal: true },
  },
  budgets: { transition_budget: 12, bounce_limit: 3, thread_budget: 3 },
  lease: { ttl_seconds: 1800, skew_guard_seconds: 120 },
};

describe("loadLifecycle (P2a)", () => {
  it("maps snake_case → camelCase, normalizes advanceOn check vocabulary, preserves the stage graph", () => {
    const lc = loadLifecycle(RAW);
    expect(lc.entryStage).toBe("design");
    // judgement markers pass through unchanged (ignored by the engine for non-mechanical stages):
    expect(lc.stages.design).toEqual({ ownerRole: "designer", gate: "judgement", advanceOn: "plan_posted", next: "development" });
    // mechanical advance_on normalized to the checks key:
    expect(lc.stages.development.advanceOn).toBe("ci");
    expect(lc.stages.testing.advanceOn).toBe("tests");
    expect(lc.stages.done).toEqual({ terminal: true });
    expect(lc.epicStages?.integrating.gate).toBe("barrier");
    expect(lc.backwardEdges["testing->development"]).toEqual({ from: "testing", to: "development" });
    expect(lc.budgets).toEqual({ transitionBudget: 12, bounceLimit: 3, respawnLimit: 3 });
    expect(lc.lease).toEqual({ ttlSeconds: 1800, skewGuardSeconds: 120 });
  });

  it("defaults respawnLimit when absent and honors an explicit value", () => {
    expect(loadLifecycle({ ...RAW, budgets: { transition_budget: 5, bounce_limit: 2 } }).budgets.respawnLimit).toBe(3);
    expect(loadLifecycle({ ...RAW, budgets: { transition_budget: 5, bounce_limit: 2, respawn_limit: 5 } }).budgets.respawnLimit).toBe(5);
  });

  it("throws on a missing entry_stage or stages", () => {
    expect(() => loadLifecycle({})).toThrow(/entry_stage/);
    expect(() => loadLifecycle({ entry_stage: "x" })).toThrow(/stages/);
  });
});
