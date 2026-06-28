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

  async applyOps(_ref: CardRef, _ops: Op[], _fence: Fence): Promise<ApplyResult> {
    throw new Error("applyOps not implemented yet");
  }
}
