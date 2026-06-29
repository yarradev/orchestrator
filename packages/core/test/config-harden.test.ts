import { describe, it, expect } from "vitest";
import { loadLifecycle } from "../src/config.js";
import { RAW_LIFECYCLE } from "./fixtures/lifecycle.js";

describe("loadLifecycle numeric hardening (P2b-1 T3)", () => {
  it("coerces a non-numeric budget to the default instead of NaN", () => {
    const lc = loadLifecycle({ ...RAW_LIFECYCLE, budgets: { transition_budget: "oops", bounce_limit: 3 } });
    expect(Number.isFinite(lc.budgets.transitionBudget)).toBe(true);
    expect(lc.budgets.transitionBudget).toBe(50); // default floor, not NaN
  });
  it("coerces non-numeric bounce/respawn/ttl/skew to their defaults", () => {
    const lc = loadLifecycle({ ...RAW_LIFECYCLE, budgets: { transition_budget: 10, bounce_limit: "x", respawn_limit: "y" }, lease: { ttl_seconds: "z", skew_guard_seconds: "w" } });
    expect(lc.budgets.bounceLimit).toBe(3);
    expect(lc.budgets.respawnLimit).toBe(3);
    expect(lc.lease.ttlSeconds).toBe(1800);
    expect(lc.lease.skewGuardSeconds).toBe(0);
  });
  it("treats a null budget as the default, not 0 (avoids escalate-everything)", () => {
    expect(loadLifecycle({ ...RAW_LIFECYCLE, budgets: { transition_budget: null, bounce_limit: 3 } }).budgets.transitionBudget).toBe(50);
  });
});
