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

const clearLeaseIfRunning = (c: CanonicalCard): Op[] =>
  c.overlays.includes("agent-running") ? [{ kind: "clearLease", epoch: currentEpoch(c) }] : [];

function escalate(c: CanonicalCard, reason: string): Decision {
  const ops: Op[] = [
    { kind: "note", body: `ESCALATE @human: ${reason}`, key: keyFor(c, "escalate") },
    { kind: "setOverlay", overlay: "escalated", on: true },
  ];
  if (c.overlays.includes("agent-running")) ops.push({ kind: "clearLease", epoch: currentEpoch(c) });
  return mk("escalate", reason, ops);
}

function advanceForward(c: CanonicalCard, st: StageDef, stagesCfg: Record<string, StageDef>, reason: string): Decision {
  const to = st.next!;
  const ops: Op[] = [
    { kind: "setStage", from: c.stage, to, epoch: currentEpoch(c) },
    { kind: "clearLease", epoch: currentEpoch(c) },
  ];
  if (stagesCfg[to]?.terminal) ops.push({ kind: "close", from: c.stage, reason: "completed" });
  return mk("advance", reason, ops);
}

export function decide(c: CanonicalCard, lc: LifecycleConfig, nowMs: number): Decision {
  void nowMs; // used from Task 8 (lease expiry)
  const stagesCfg = c.type === "epic" ? (lc.epicStages ?? {}) : lc.stages;
  const st: StageDef | undefined = stagesCfg[c.stage];
  if (!st) return mk("escalate", `unknown ${c.type} stage: ${c.stage}`);
  if (st.terminal) return mk("noop", `card is terminal (${c.stage})`);
  if (c.malformed && c.malformed.length > 0) return escalate(c, `malformed card: ${c.malformed.join("; ")}`);

  const b = c.counters;
  if (b.transitions >= lc.budgets.transitionBudget)
    return escalate(c, `transition budget exceeded (${b.transitions}/${lc.budgets.transitionBudget})`);
  for (const edge of Object.keys(b.bounces)) {
    if (b.bounces[edge]! >= lc.budgets.bounceLimit)
      return escalate(c, `bounce limit exceeded on ${edge} (${b.bounces[edge]}/${lc.budgets.bounceLimit})`);
  }

  const advs = Object.values(c.advisors);
  if (c.overlays.includes("veto-held") && !advs.some((a) => a.vetoOpen || a.vetoEver))
    return escalate(c, "board drift: veto:held overlay but no [VETO] was ever posted");
  if (c.overlays.includes("blocked") && !c.questions.blocking)
    return escalate(c, "board drift: blocked overlay but no open QUESTION (would park forever)");

  if (c.overlays.includes("blocked")) {
    const bq = c.questions.blocking;
    if (bq?.answerPending) return mk("unblock", "answer received; resuming owner", [{ kind: "setOverlay", overlay: "blocked", on: false }]);
    if (bq?.deadlinePassed) return escalate(c, "decision deadline passed while blocked");
    return mk("noop", "parked: blocked awaiting input");
  }

  if (c.overlays.includes("veto-held")) {
    if (!advs.some((a) => a.vetoOpen))
      return mk("veto-clear", "security VETO cleared by accountable human; resuming", [{ kind: "setOverlay", overlay: "veto-held", on: false }]);
    return mk("noop", "parked: held by security VETO awaiting accountable CLEAR");
  }

  if (c.questions.blocking && !c.questions.blocking.answered) {
    const cat = c.questions.blocking.category || "product";
    const ops: Op[] = [
      { kind: "setOverlay", overlay: "blocked", on: true },
      ...clearLeaseIfRunning(c),
      { kind: "ask", category: cat, body: `Blocking question (cat:${cat}) needs an answer.`, key: keyFor(c, "ask") },
    ];
    return mk("block", `routing QUESTION cat:${cat}`, ops);
  }

  if (st.gate === "barrier") {
    const ch = c.children ?? { total: 0, done: 0 };
    if (ch.total === 0) return escalate(c, `fan-in barrier at ${c.stage} with 0 child stories (decompose produced none?)`);
    if (ch.done >= ch.total) return advanceForward(c, st, stagesCfg, `fan-in: all ${ch.total} child stories done`);
    return mk("noop", `fan-in barrier: ${ch.done}/${ch.total} child stories done`);
  }

  // Branches added in precedence order by Tasks 2-9. Until then, a non-terminal stage is a no-op.
  return mk("noop", `no decision branch matched for stage ${c.stage}`);
}
