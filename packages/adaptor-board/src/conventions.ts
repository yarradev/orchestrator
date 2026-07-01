import type { Op, CanonicalCard } from "@yarradev/core";
import type { ActInput, EnrichedBoardCard } from "@yarradev/board-client";

/** Map an orchestrator Op to a board ActInput. Returns null for ops the board handles natively via
  * side-effects (e.g. setOverlay is handled by VETO/HOLD/CLEAR_VETO acts, not a direct overlay toggle). */
export function opToAct(op: Op, itemId: string, gen: number): ActInput | null {
  const base = { item_id: itemId };
  switch (op.kind) {
    case "claim":
      return { ...base, type: "CLAIM", gen: null, data: { role: op.role, ttl_s: op.ttlS } };
    case "clearLease":
      return { ...base, type: "CLEAR_LEASE", gen };
    case "setStage":
      return { ...base, type: "MOVE", gen, data: { from: op.from, to: op.to } };
    case "reject":
      return { ...base, type: "REJECT", gen, data: { from: op.from, to: op.to, edge: op.edge } };
    case "note":
      return { ...base, type: "NOTE", gen: null, data: { body: op.body }, idempotency_key: `${itemId}:${gen}:note:${op.key}` };
    case "veto":
      return { ...base, type: "VETO", gen: null, data: { reason: op.reason, role: op.role } };
    case "hold":
      return { ...base, type: "HOLD", gen: null, data: { reason: op.reason, role: op.role } };
    case "clearVeto":
      return { ...base, type: "CLEAR_VETO", gen: null };
    case "close":
      return { ...base, type: "MOVE", gen, data: { from: op.from, to: "done" } };
    // setOverlay is handled by veto/hold/clearVeto acts — no direct overlay toggle on the board
    default:
      return null;
  }
}

/** Map a board AppendOutcome to the orchestrator's OpResult outcome. */
export function appendOutcomeToOpResult(outcome: string): "committed" | "fenced" | "gate_blocked" | "unsupported" | "failed" {
  switch (outcome) {
    case "committed":
    case "conflict_idem":
      return "committed";
    case "fenced":
      return "fenced";
    case "gate_blocked":
      return "gate_blocked";
    case "unauthorized":
      return "fenced"; // orchestrator sees state drift
    case "bad_act":
      return "failed";
    default:
      return "failed";
  }
}

/** Map an EnrichedBoardCard to a CanonicalCard. epoch = current_gen (1:1 bridge). */
export function mapEnrichedToCanonical(ec: EnrichedBoardCard): CanonicalCard {
  return {
    id: ec.id,
    type: ec.type === "epic" ? "epic" : "story",
    stage: ec.stage ?? "",
    state: ec.state as "open" | "closed",
    overlays: [
      ...(ec.blocked ? ["blocked" as const] : []),
      ...(ec.veto_held ? ["veto-held" as const] : []),
      ...(ec.hold_open ? ["hold-open" as const] : []),
      ...(ec.escalated ? ["escalated" as const] : []),
      ...(ec.lease_role ? ["agent-running" as const] : []),
    ],
    lease: ec.lease_role && ec.lease_gen != null
      ? { role: ec.lease_role, epoch: ec.lease_gen, holder: "board", expiresAt: ec.lease_expiry_ts ?? 0 }
      : null,
    pr: ec.linked_head_sha ? { number: 0, head: ec.linked_head_sha, files: [] } : null,
    checks: { ci: ec.ci_rollup as "success" | "failure" | "pending" | "absent" },
    advisors: {},
    counters: { transitions: ec.transitions_count, bounces: {} },
    epoch: ec.current_gen,
    questions: { open: ec.open_questions?.length ?? 0 },
    title: ec.title ?? "",
    parentId: ec.parent_id,
  };
}
