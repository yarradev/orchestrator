import { loadLifecycle } from "../../src/config.js";
import { makeCanonicalCard } from "../../src/card.js";
import type { CanonicalCard } from "../../src/types.js";

export const RAW_LIFECYCLE = {
  entry_stage: "design",
  stages: {
    design:      { owner_role: "designer",  gate: "judgement",  advance_on: "plan_posted", next: "development" },
    development: { owner_role: "developer",  gate: "mechanical", advance_on: "ci_green",    next: "testing" },
    testing:     { owner_role: "tester",     gate: "mechanical", advance_on: "tests_green", next: "done" },
    done:        { terminal: true },
  },
  backward_edges: {
    "development->design":  { from: "development", to: "design" },
    "testing->development": { from: "testing",     to: "development" },
  },
  epic_entry_stage: "analysis",
  epic_stages: {
    analysis:    { owner_role: "analyst", gate: "judgement", advance_on: "brief_posted",    next: "decompose" },
    decompose:   { owner_role: "analyst", gate: "judgement", advance_on: "stories_created", next: "integrating" },
    integrating: { gate: "barrier",       advance_on: "all_children_done",                  next: "done" },
    done:        { terminal: true },
  },
  budgets: { transition_budget: 12, bounce_limit: 3 },
  lease:   { ttl_seconds: 1800, skew_guard_seconds: 120 },
};

export const LC = loadLifecycle(RAW_LIFECYCLE);
export const NOW = 1_000_000;
export const card = (o: Partial<CanonicalCard> & { id?: string } = {}): CanonicalCard =>
  makeCanonicalCard({ id: "1", ...o });
