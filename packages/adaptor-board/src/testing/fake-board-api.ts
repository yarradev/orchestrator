import type { EnrichedBoardCard, CardRef, AppendResult, ActInput } from "@yarrasys/board-client";

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
          // Fence if there's an active unexpired lease
          const now = Date.now();
          if (card.lease_role && card.lease_expiry_ts && card.lease_expiry_ts > now) {
            return { outcome: "fenced", status: 409, seq: ++this.seq, applied: false, reason: "active lease" };
          }
          card.current_gen += 1;
          card.lease_role = (act.data?.role as string) ?? null;
          card.lease_gen = card.current_gen;
          card.lease_expiry_ts = now + ((act.data?.ttl_s as number) ?? 1800) * 1000;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "CLEAR_LEASE": {
          card.lease_role = null;
          card.lease_gen = null;
          card.lease_expiry_ts = null;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "MOVE": {
          // Fence if the from stage doesn't match the card's current stage
          const from = act.data?.from as string | undefined;
          if (from != null && from !== card.stage) {
            return { outcome: "fenced", status: 409, seq: ++this.seq, applied: false, reason: "stage mismatch" };
          }
          card.stage = (act.data?.to as string) ?? card.stage;
          card.transitions_count += 1;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true, item: { ...card } };
        }
        case "REJECT": {
          // Fence if the from stage doesn't match the card's current stage
          const rejFrom = act.data?.from as string | undefined;
          if (rejFrom != null && rejFrom !== card.stage) {
            return { outcome: "fenced", status: 409, seq: ++this.seq, applied: false, reason: "stage mismatch" };
          }
          card.stage = (act.data?.to as string) ?? card.stage;
          card.transitions_count += 1;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true, item: { ...card } };
        }
        case "NOTE": {
          card.notes.push({
            seq: card.notes.length + 1,
            body: (act.data?.body as string) ?? "",
            role: "system",
            at: Date.now(),
          });
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "VETO": {
          card.vetoes.push({
            role: (act.data?.role as string) ?? "system",
            reason: (act.data?.reason as string) ?? "",
            at: Date.now(),
          });
          card.veto_held = true;
          card.blocked = true;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "HOLD": {
          card.holds.push({
            role: (act.data?.role as string) ?? "system",
            reason: (act.data?.reason as string) ?? "",
            at: Date.now(),
          });
          card.hold_open = true;
          card.blocked = true;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        case "CLEAR_VETO": {
          card.vetoes = [];
          card.veto_held = false;
          card.blocked = card.holds.length > 0;
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
        default: {
          return { outcome: "committed", status: 202, seq: ++this.seq, applied: true };
        }
      }
    });
  }
}
