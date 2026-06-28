import type { CanonicalCard } from "./types.js";

export function makeCanonicalCard(partial: Partial<CanonicalCard> & { id: string }): CanonicalCard {
  return {
    type: "story",
    stage: "spec",
    state: "open",
    overlays: [],
    lease: null,
    checks: { ci: "absent" },
    pr: null,
    advisors: {},
    counters: { transitions: 0, bounces: {} },
    questions: { open: 0 },
    title: "",
    parentId: null,
    ...partial,
  };
}
