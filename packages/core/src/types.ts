export type GateStatus = "success" | "pending" | "failure" | "blocked" | "absent";
export type Overlay = "agent-running" | "blocked" | "veto-held" | "hold-open" | "escalated";

export interface Lease { epoch: number; holder: string; role: string; expiresAt: number; }

export interface CanonicalCard {
  id: string;
  type: "story" | "epic";
  stage: string;
  state: "open" | "closed";
  overlays: Overlay[];
  lease: Lease | null;
  checks: { ci: GateStatus; staging?: GateStatus };
  pr: { number: number; head: string; files: string[] } | null;
  advisors: Record<string, { vetoOpen: boolean; holdOpen: boolean; reviewedHead?: string }>;
  counters: { transitions: number; bounces: Record<string, number> };
  malformed?: string[]; // non-empty ⇒ card is malformed; never advances (fail-closed escalate)
  questions: { open: number };
  title: string;
  parentId: string | null;
  epoch?: number;
}

export interface CardRef { id: string; stage: string; type: "story" | "epic"; }

export interface ReadyFilter { stages?: string[]; excludeOverlays?: Overlay[]; }

export interface BackendCapabilities {
  ci: "pull" | "push";
  fencing: "native" | "orchestrator";
  prDiff: boolean;
  projectsView: boolean;
  richComments: boolean;
  assignees: boolean;
  milestones: boolean;
}

// Key asymmetry: free-form `note` carries an explicit idempotency `key` (caller-chosen, opaque to
// the backend). Structured governance ops (when added — setOverlay, veto, etc.) derive their dedup
// key from identifying fields (e.g. overlay+card, role+card) so backends dedup them consistently
// without requiring callers to mint and track extra keys.
export type Op =
  | { kind: "claim"; role: string; epoch: number; ttlS: number }
  | { kind: "clearLease"; epoch: number }
  | { kind: "setStage"; from: string; to: string; epoch: number }
  | { kind: "reject"; from: string; to: string; epoch: number; edge: string }
  | { kind: "setOverlay"; overlay: Overlay; on: boolean }
  | { kind: "note"; body: string; key: string }
  | { kind: "ask"; category: string; body: string; key: string }
  | { kind: "veto"; role: string; head: string; reason: string }
  | { kind: "hold"; role: string; head: string; reason: string }
  | { kind: "clearVeto"; role: string }
  | { kind: "linkPR"; number: number; head: string; repo: string }
  | { kind: "pushHead"; head: string }
  | { kind: "close"; from: string; reason: string };

export type OpOutcome = "committed" | "fenced" | "gate_blocked" | "unsupported" | "failed";
export interface OpResult { op: Op; outcome: OpOutcome; reason?: string; }
export interface ApplyResult { ok: boolean; results: OpResult[]; }
export interface Fence { epoch: number; holder: string; }

// The pure output of decide() (P2b). Either backend ops to apply, or a dispatch instruction telling the
// loop to run a role-agent and feed its verdict to reduceVerdict. A dispatch always carries its claim in ops.
export interface Decision {
  action: "spawn" | "reclaim" | "advance" | "escalate" | "block" | "unblock" | "veto-clear" | "noop";
  reason: string;
  ops: Op[];
  dispatch?: { role: string; epoch: number; mode: "judgement" | "mechanical"; respawn: boolean };
}
