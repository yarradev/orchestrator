import type { CanonicalCard, Decision, Op } from "./types.js";
import type { LifecycleConfig, StageDef } from "./config.js";

export const currentEpoch = (c: CanonicalCard): number => c.epoch ?? 0;
export const keyFor = (c: CanonicalCard, kind: string): string => `${c.id}:${currentEpoch(c)}:${kind}`;

export function leaseExpired(c: CanonicalCard, lc: LifecycleConfig, nowMs: number): boolean {
  if (!c.lease) return false;
  const exp = c.lease.expiresAt;
  if (!Number.isFinite(exp)) return true; // fail-closed: unparseable anchor → reclaimable
  return nowMs > exp + (lc.lease.skewGuardSeconds ?? 0) * 1000;
}

const mk = (action: Decision["action"], reason: string, ops: Op[] = [], dispatch?: Decision["dispatch"]): Decision =>
  ({ action, reason, ops, dispatch });

function escalate(c: CanonicalCard, reason: string): Decision {
  const ops: Op[] = [
    { kind: "note", body: `ESCALATE @human: ${reason}`, key: keyFor(c, "escalate") },
    { kind: "setOverlay", overlay: "escalated", on: true },
  ];
  if (c.overlays.includes("agent-running")) ops.push({ kind: "clearLease", epoch: currentEpoch(c) });
  return mk("escalate", reason, ops);
}

export function decide(c: CanonicalCard, lc: LifecycleConfig, nowMs: number): Decision {
  void nowMs; // used from Task 8 (lease expiry)
  const stagesCfg = c.type === "epic" ? (lc.epicStages ?? {}) : lc.stages;
  const st: StageDef | undefined = stagesCfg[c.stage];
  if (!st) return mk("escalate", `unknown ${c.type} stage: ${c.stage}`);
  if (st.terminal) return mk("noop", `card is terminal (${c.stage})`);
  if (c.malformed && c.malformed.length > 0) return escalate(c, `malformed card: ${c.malformed.join("; ")}`);

  // Branches added in precedence order by Tasks 2-9. Until then, a non-terminal stage is a no-op.
  return mk("noop", `no decision branch matched for stage ${c.stage}`);
}
