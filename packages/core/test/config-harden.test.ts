import { describe, it, expect } from "vitest";
import { loadLifecycle } from "../src/config.js";
import { RAW_LIFECYCLE } from "./fixtures/lifecycle.js";

describe("loadLifecycle numeric hardening (P2b-1 T3)", () => {
  it("coerces a non-numeric budget to the default instead of NaN", () => {
    const lc = loadLifecycle({ ...RAW_LIFECYCLE, budgets: { transition_budget: "oops", bounce_limit: 3 } });
    expect(Number.isFinite(lc.budgets.transitionBudget)).toBe(true);
    expect(lc.budgets.transitionBudget).toBe(50); // default floor, not NaN
  });
});
