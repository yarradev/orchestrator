import type { BoardBackend } from "../backend.js";
import type { ApplyResult, BackendCapabilities, CanonicalCard, CardRef, Fence, Op, ReadyFilter } from "../types.js";

export class InMemoryBoardBackend implements BoardBackend {
  private cards = new Map<string, CanonicalCard>();
  readonly capabilities: BackendCapabilities = {
    ci: "push", fencing: "orchestrator", prDiff: false,
    projectsView: false, richComments: true, assignees: false, milestones: false,
  };
  constructor(private readonly states: string[], private readonly terminal: string[]) {}

  seed(card: CanonicalCard): void { this.cards.set(card.id, structuredClone(card)); }

  async listReady(filter: ReadyFilter): Promise<CardRef[]> {
    const out: CardRef[] = [];
    for (const c of this.cards.values()) {
      if (c.state !== "open") continue;
      if (this.terminal.includes(c.stage)) continue;
      if (filter.stages && !filter.stages.includes(c.stage)) continue;
      if (filter.excludeOverlays?.some((o) => c.overlays.includes(o))) continue;
      out.push({ id: c.id, stage: c.stage, type: c.type });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  async readCard(ref: CardRef): Promise<CanonicalCard> {
    const c = this.cards.get(ref.id);
    if (!c) throw new Error(`no such card: ${ref.id}`);
    return structuredClone(c);
  }

  private now(): number { return 1_000_000; } // deterministic clock for tests; real clock injected later

  private liveLease(c: CanonicalCard) {
    return c.lease && c.lease.expiresAt > this.now() ? c.lease : null;
  }

  async applyOps(ref: CardRef, ops: Op[], fence: Fence): Promise<ApplyResult> {
    const c = this.cards.get(ref.id);
    if (!c) throw new Error(`no such card: ${ref.id}`);
    const results: import("../types.js").OpResult[] = [];
    for (const op of ops) {
      // Epoch fence: if a live lease exists and the op is not a fresh claim, the fence epoch must match it.
      const live = this.liveLease(c);
      if (live && op.kind !== "claim" && fence.epoch !== live.epoch) {
        results.push({ op, outcome: "fenced", reason: `stale epoch ${fence.epoch} != ${live.epoch}` });
        continue;
      }
      switch (op.kind) {
        case "claim": {
          if (live) { results.push({ op, outcome: "fenced", reason: "already leased" }); break; }
          c.lease = { epoch: op.epoch, holder: fence.holder, role: op.role, expiresAt: this.now() + op.ttlS * 1000 };
          results.push({ op, outcome: "committed" });
          break;
        }
        case "clearLease": {
          c.lease = null;
          results.push({ op, outcome: "committed" });
          break;
        }
        default:
          results.push({ op, outcome: "failed", reason: `unhandled op ${op.kind}` });
      }
    }
    return { ok: results.every((r) => r.outcome === "committed"), results };
  }
}
