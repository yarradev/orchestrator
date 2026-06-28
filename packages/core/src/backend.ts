import type { ApplyResult, BackendCapabilities, CanonicalCard, CardRef, Fence, Op, ReadyFilter } from "./types.js";

export interface BoardBackend {
  readonly capabilities: BackendCapabilities;
  listReady(filter: ReadyFilter): Promise<CardRef[]>;
  readCard(ref: CardRef): Promise<CanonicalCard>;
  applyOps(ref: CardRef, ops: Op[], fence: Fence): Promise<ApplyResult>;
}
