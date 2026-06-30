import type { EnrichedBoardCard, CardRef, AppendResult, ActInput } from "@yarradev/board-client";

export interface FakeBoardApiOpts {
  terminalStages?: string[];
}

/** In-memory BoardClient surface for contract testing. Same pattern as InMemoryGitHubApi. */
export class FakeBoardApi {
  private cards = new Map<string, EnrichedBoardCard>();
  private seq = 0;

  constructor(_opts: FakeBoardApiOpts = {}) { /* opts reserved for future config */ }

  /** Seed a card into the fake. */
  seed(card: EnrichedBoardCard): void {
    this.cards.set(card.id, { ...card });
  }

  /** Read a seeded card for test assertions. */
  get(id: string): EnrichedBoardCard | undefined {
    return this.cards.get(id);
  }

  async listCards(opts: {
    state?: string;
    stages?: string[];
    excludeOverlays?: string[];
    limit?: number;
  } = {}): Promise<CardRef[]> {
    return Array.from(this.cards.values())
      .filter((c) => {
        if (opts.state && c.state !== opts.state) return false;
        if (opts.stages && !opts.stages.includes(c.stage ?? "")) return false;
        if (opts.excludeOverlays?.includes("escalated") && c.escalated) return false;
        return true;
      })
      .map((c) => ({ id: c.id, stage: c.stage ?? "", type: (c.type === "epic" ? "epic" : "story") as CardRef["type"] }));
  }

  async readEnriched(id: string): Promise<EnrichedBoardCard> {
    const c = this.cards.get(id);
    if (!c) throw new Error(`card not found: ${id}`);
    return { ...c };
  }

  async submitActs(acts: ActInput[]): Promise<AppendResult[]> {
    return acts.map((act) => {
      const card = this.cards.get(act.item_id);
      if (!card) return { outcome: "bad_act", status: 422, seq: ++this.seq, applied: false, reason: "unknown item" };

      // Simulate gen fencing
      if (act.gen != null && act.gen !== card.current_gen) {
        return { outcome: "fenced", status: 409, seq: ++this.seq, applied: false, reason: "gen mismatch" };
      }

      // Simulate basic act handling
      switch (act.type) {
        case "CLAIM": {
          card.current_gen += 1;
          card.lease_role = (act.data?.role as string) ?? null;
          card.lease_gen = card.current_gen;
          card.lease_expiry_ts = Date.now() + ((act.data?.ttl_s as number) ?? 1800) * 1000;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "CLEAR_LEASE": {
          card.lease_role = null;
          card.lease_gen = null;
          card.lease_expiry_ts = null;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "MOVE": {
          card.stage = (act.data?.to as string) ?? card.stage;
          card.transitions_count += 1;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true, item: { ...card } };
        }
        case "REJECT": {
          card.stage = (act.data?.to as string) ?? card.stage;
          card.transitions_count += 1;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true, item: { ...card } };
        }
        default: {
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
      }
    });
  }
}
