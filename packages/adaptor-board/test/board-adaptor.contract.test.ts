import { describe } from "vitest";
import { runBoardBackendContract } from "@yarradev/core/testing";
import { BoardAdaptor } from "../src/board-adaptor.js";
import { FakeBoardApi } from "../src/testing/fake-board-api.js";
import type { BoardBackend, CanonicalCard } from "@yarradev/core";
import type { EnrichedBoardCard } from "@yarrasys/board-client";

// Convert a CanonicalCard to an EnrichedBoardCard for seeding the FakeBoardApi.
function toEnriched(c: CanonicalCard): EnrichedBoardCard {
  return {
    id: c.id,
    type: c.type,
    stage: c.stage,
    state: c.state ?? "open",
    current_gen: c.epoch ?? 0,
    blocked: c.overlays?.includes("blocked") ?? false,
    veto_held: c.overlays?.includes("veto-held") ?? false,
    hold_open: c.overlays?.includes("hold-open") ?? false,
    ci_rollup: c.checks?.ci ?? "absent",
    lease_role: c.lease?.role ?? null,
    lease_gen: c.lease?.epoch ?? null,
    lease_expiry_ts: c.lease?.expiresAt ?? null,
    linked_head_sha: c.pr?.head ?? null,
    transitions_count: c.counters?.transitions ?? 0,
    title: c.title ?? null,
    parent_id: c.parentId ?? null,
    escalated: c.overlays?.includes("escalated") ?? false,
    open_questions: [],
    answered_questions: [],
    notes: [],
    vetoes: [],
    holds: [],
    escalated_reason: null,
  };
}

describe("BoardBackend contract: board-adaptor (P4+P5)", () => {
  runBoardBackendContract({
    name: "board-adaptor",
    async make(): Promise<BoardBackend> {
      return new BoardAdaptor(new FakeBoardApi() as any);
    },
    async seed(backend: BoardBackend, card: CanonicalCard): Promise<void> {
      (backend as unknown as { client: FakeBoardApi }).client.seed(toEnriched(card));
    },
    card(overrides: Partial<CanonicalCard> & { id?: string } = {}): CanonicalCard {
      return {
        id: overrides.id ?? "c",
        type: "story",
        stage: "dev",
        state: "open",
        overlays: [],
        lease: null,
        pr: null,
        checks: { ci: "absent" },
        advisors: {},
        counters: { transitions: 0, bounces: {} },
        epoch: 0,
        questions: { open: 0 },
        title: "test",
        parentId: null,
        ...overrides,
      };
    },
  });
});
