import type {
  BoardBackend, CanonicalCard, CardRef, ReadyFilter, Op, Fence, ApplyResult, BackendCapabilities,
} from "@yarradev/core";
import type { BoardClient } from "@yarradev/board-client";
import { opToAct, appendOutcomeToOpResult, mapEnrichedToCanonical } from "./conventions.js";

export class BoardAdaptor implements BoardBackend {
  readonly capabilities: BackendCapabilities = {
    ci: "push",
    fencing: "orchestrator",
    prDiff: false,
    projectsView: false,
    richComments: true,
    assignees: false,
    milestones: false,
  };

  constructor(private readonly client: BoardClient) {}

  async listReady(filter: ReadyFilter): Promise<CardRef[]> {
    return this.client.listCards({
      state: "open",
      stages: filter.stages,
      excludeOverlays: filter.excludeOverlays as string[] | undefined,
    });
  }

  async readCard(ref: CardRef): Promise<CanonicalCard> {
    const ec = await this.client.readEnriched(ref.id);
    return mapEnrichedToCanonical(ec);
  }

  async applyOps(ref: CardRef, ops: Op[], _fence: Fence): Promise<ApplyResult> {
    // Read the card first to get current gen (the board is the gen source of truth).
    const ec = await this.client.readEnriched(ref.id);
    const gen = ec.current_gen;

    const acts = ops
      .map((op) => opToAct(op, ref.id, gen))
      .filter((a): a is NonNullable<typeof a> => a != null);

    if (acts.length === 0) {
      // All ops mapped to null — nothing for the board to do.
      return { ok: true, results: ops.map((op) => ({ op, outcome: "unsupported" as const, reason: "no board act mapping" })) };
    }

    const results = await this.client.submitActs(acts);

    return {
      ok: results.every((r) => r.outcome === "committed" || r.outcome === "conflict_idem"),
      results: ops.map((op, i) => {
        const r = results[i];
        if (!r) return { op, outcome: "unsupported" as const, reason: "no board act mapping" };
        return { op, outcome: appendOutcomeToOpResult(r.outcome), reason: r.reason };
      }),
    };
  }
}
