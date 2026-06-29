import type { CanonicalCard, Decision, Op } from "./types.js";
import type { LifecycleConfig, StageDef, TeamPolicy } from "./config.js";

const GATE_KEY: Record<string, "ci" | "tests" | "staging"> = { ci_green: "ci", ci: "ci", tests_green: "tests", tests: "tests", staging: "staging" };

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

export function escalateOps(c: CanonicalCard, reason: string): Op[] {
  return [
    { kind: "note", body: `ESCALATE @human: ${reason}`, key: keyFor(c, "escalate") },
    { kind: "setOverlay", overlay: "escalated", on: true },
    ...clearLeaseIfRunning(c),
  ];
}

function escalate(c: CanonicalCard, reason: string): Decision {
  return mk("escalate", reason, escalateOps(c, reason));
}

export function advanceOps(c: CanonicalCard, st: StageDef, stagesCfg: Record<string, StageDef>): Op[] {
  const to = st.next!;
  const ops: Op[] = [
    { kind: "setStage", from: c.stage, to, epoch: currentEpoch(c) },
    { kind: "clearLease", epoch: currentEpoch(c) },
  ];
  if (stagesCfg[to]?.terminal) ops.push({ kind: "close", from: c.stage, reason: "completed" });
  return ops;
}

function advanceForward(c: CanonicalCard, st: StageDef, stagesCfg: Record<string, StageDef>, reason: string): Decision {
  return mk("advance", reason, advanceOps(c, st, stagesCfg));
}

function dispatchOwner(c: CanonicalCard, lc: LifecycleConfig, st: StageDef, action: "spawn" | "reclaim", reason: string): Decision {
  const epoch = currentEpoch(c) + 1;
  const mode = st.gate === "mechanical" ? "mechanical" : "judgement";
  const respawn = mode === "mechanical" && c.pr != null;
  return mk(action, reason, [{ kind: "claim", role: st.ownerRole!, epoch, ttlS: lc.lease.ttlSeconds }], { role: st.ownerRole!, epoch, mode, respawn });
}

// Minimal glob → RegExp (supports **, *, ?) for advisor watch_paths. Case-INSENSITIVE: real filenames are
// often CamelCase and a security diff-hook must not miss them. Ported from v1 eval-gates.js (the 'i' flag is load-bearing).
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(ch)) re += "\\" + ch;
    else re += ch;
  }
  return new RegExp("^" + re + "$", "i");
}

export function watchMatch(files: string[], patterns: string[]): boolean {
  if (!files.length || !patterns.length) return false;
  const res = patterns.map(globToRegExp);
  return files.some((f) => res.some((r) => r.test(f)));
}

// Advisor watch-paths gate (§A5), run on the mechanical success leg BEFORE advanceForward. Returns a Decision
// to override the advance (dispatch/park/escalate), or null to allow it. An open VETO/HOLD is honored
// regardless of the PR's CURRENT files (a later commit can drift them below watch_paths). The advisor verdict
// sets the flag (reduceVerdict); this gate sets the veto-held overlay / escalates @human (escalate-once via the
// keyed note). DEFERRED (documented): gh#39 content scanners, gh#32 clear_authority breadcrumb, gh#25 advisorMiss,
// gh#56 re-review reason suffix, and a clearHold op / hold-open overlay lifecycle.
function advisorGate(c: CanonicalCard, lc: LifecycleConfig, policy: TeamPolicy, nowMs: number): Decision | null {
  const adv = policy.advisors.find((a) => a.joinsAt.includes(c.stage));
  if (!adv) return null;
  const ast = c.advisors[adv.role];
  const vetoOpen = ast?.vetoOpen ?? false;
  const holdOpen = ast?.holdOpen ?? false;
  const watchMatched = watchMatch(c.pr?.files ?? [], adv.watchPaths);
  if (!vetoOpen && !holdOpen && !watchMatched) return null; // advisor not engaged → allow advance

  if (vetoOpen) {
    return mk("block", `${adv.role} VETO open — needs accountable CLEAR`, [
      { kind: "setOverlay", overlay: "veto-held", on: true },
      ...clearLeaseIfRunning(c),
      { kind: "note", body: `ESCALATE @human: Security VETO on #${c.id} must be CLEARed by an accountable human before merge.`, key: keyFor(c, "veto-hold") },
    ]);
  }
  if (holdOpen) {
    return mk("block", `${adv.role} HOLD open — escalated @human, awaiting CLEAR/ACK`, [
      ...clearLeaseIfRunning(c),
      { kind: "note", body: `ESCALATE @human: Security HOLD on #${c.id}: a human compliance sign-off (CLEAR/ACK) is required before this advances.`, key: keyFor(c, "hold") },
    ]);
  }

  let reReview = false;
  if (ast?.reviewedHead) {
    if (c.pr && c.pr.head.indexOf(ast.reviewedHead) === 0) return null; // reviewed THIS head → allow advance
    reReview = true; // head moved past the reviewed sha → re-dispatch
  }
  if (c.lease && c.lease.role === adv.role && !leaseExpired(c, lc, nowMs)) return mk("noop", `${adv.role} reviewing (lease held)`);

  const epoch = currentEpoch(c) + 1;
  const reason = reReview
    ? `re-dispatch ${adv.role}: PR head moved past reviewed sha:${ast?.reviewedHead}`
    : `dispatch ${adv.role} (watch_paths match)`;
  return mk("spawn", reason, [{ kind: "claim", role: adv.role, epoch, ttlS: lc.lease.ttlSeconds }], { role: adv.role, epoch, mode: "judgement", respawn: false });
}

export function decide(c: CanonicalCard, lc: LifecycleConfig, nowMs: number, policy: TeamPolicy = { advisors: [] }): Decision {
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

  if (st.gate === "mechanical" && c.pr) {
    const g = c.checks[GATE_KEY[st.advanceOn ?? "ci"] ?? "ci"] ?? "absent";
    if (g === "success") {
      const gate = advisorGate(c, lc, policy, nowMs);
      if (gate) return gate;
      return advanceForward(c, st, stagesCfg, `mechanical gate ${st.advanceOn}=success`);
    }
    if (g === "pending") return mk("noop", `${st.advanceOn} pending`);
    if (g === "failure") {
      if (c.lease && !leaseExpired(c, lc, nowMs)) return mk("noop", `${st.advanceOn} failed; worker still holds lease`);
      if ((c.counters.respawns ?? 0) >= lc.budgets.respawnLimit) return escalate(c, `respawn limit exceeded (${c.counters.respawns}/${lc.budgets.respawnLimit}) on ${c.stage}`);
      return dispatchOwner(c, lc, st, "spawn", `${st.advanceOn} failed; re-spawn ${st.ownerRole} to fix`);
    }
    return mk("noop", `required check ${st.advanceOn} absent (fail-closed)`);
  }

  if (c.lease) {
    if (leaseExpired(c, lc, nowMs)) return dispatchOwner(c, lc, st, "reclaim", `lease expired (epoch ${currentEpoch(c)}); bump epoch + re-spawn`);
    return mk("noop", "worker holds a valid lease; awaiting output");
  }

  // No lease, not terminal, nothing pending → spawn the stage owner (judgement, or mechanical with no PR yet).
  return dispatchOwner(c, lc, st, "spawn", `spawn ${st.ownerRole} for stage:${c.stage}`);
}
