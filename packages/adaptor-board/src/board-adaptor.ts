import type {
  BoardBackend, CanonicalCard, CardRef, ReadyFilter, Op, Fence, ApplyResult, OpResult, BackendCapabilities,
} from "@yarradev/core";
import type { BoardClient, ActInput } from "@yarradev/board-client";
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

    // Map ops → acts, tracking which ops produced an act (some map to null).
    const indexed: { op: Op; act: ActInput | null }[] = ops.map((op) => ({ op, act: opToAct(op, ref.id, gen) }));
    const acts = indexed.filter((e) => e.act != null).map((e) => e.act!);

    if (acts.length === 0) {
      return { ok: true, results: ops.map((op) => ({ op, outcome: "unsupported" as const, reason: "no board act mapping" })) };
    }

    const boardResults = await this.client.submitActs(acts);

    // Map board results back to ops, preserving index alignment.
    let ri = 0;
    const results: OpResult[] = [];
    for (const e of indexed) {
      if (e.act == null) {
        results.push({ op: e.op, outcome: "unsupported", reason: "no board act mapping" });
      } else {
        const br = boardResults[ri++];
        results.push({
          op: e.op,
          outcome: br ? appendOutcomeToOpResult(br.outcome) : "failed",
          reason: br?.reason,
        });
      }
    }

    return {
      ok: results.every((r) => r.outcome === "committed"),
      results,
    };
  }
}
