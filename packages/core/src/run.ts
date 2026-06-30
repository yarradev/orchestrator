import type { BoardBackend } from "./backend.js";
import type { CanonicalCard, CardRef, Decision, Fence, OpResult, Verdict } from "./types.js";
import type { LifecycleConfig, TeamPolicy } from "./config.js";
import { decide, currentEpoch } from "./decide.js";

export interface DispatchRequest {
  card: CanonicalCard;
  role: string;
  epoch: number;
  mode: "judgement" | "mechanical";
  respawn: boolean;
}

export interface Dispatcher {
  dispatch(req: DispatchRequest): Promise<Verdict>;
}

export interface RunDeps {
  backend: BoardBackend;
  lc: LifecycleConfig;
  policy?: TeamPolicy;
  dispatcher?: Dispatcher;
  now: () => number;        // injectable clock
  holder?: string;          // lease-holder identity (default "orchestrator")
}

export interface RunOptions {
  dryRun?: boolean;
  stages?: string[];
}

export interface CardOutcome {
  ref: CardRef;
  action: Decision["action"];
  reason: string;
  dispatched?: { role: string; epoch: number; mode: "judgement" | "mechanical" };
  verdict?: Verdict;
  applied: OpResult[];
  note?: string;
}

export interface PassReport {
  outcomes: CardOutcome[];
}

// Escalated cards are human-parked — skip them so the loop does not spin. blocked/veto-held cards are
// kept IN: decide() resolves them (unblock on answer, veto-clear on accountable CLEAR).
const EXCLUDE_OVERLAYS = ["escalated"] as const;

export async function runPass(deps: RunDeps, opts: RunOptions = {}): Promise<PassReport> {
  const { backend, lc } = deps;
  const policy = deps.policy ?? { advisors: [] };
  const holder = deps.holder ?? "orchestrator";
  const dryRun = opts.dryRun ?? false;

  const refs = await backend.listReady({
    ...(opts.stages ? { stages: opts.stages } : {}),
    excludeOverlays: [...EXCLUDE_OVERLAYS],
  });

  const outcomes: CardOutcome[] = [];
  for (const ref of refs) {
    const card = await backend.readCard(ref);
    const decision = decide(card, lc, deps.now(), policy);
    const out: CardOutcome = { ref, action: decision.action, reason: decision.reason, applied: [] };

    if (dryRun) {
      if (decision.dispatch) {
        out.dispatched = { role: decision.dispatch.role, epoch: decision.dispatch.epoch, mode: decision.dispatch.mode };
      }
      out.note = "dry-run";
      outcomes.push(out);
      continue;
    }

    if (decision.dispatch) {
      // Task 3 fills in the live dispatch leg here. For now: apply the claim under the dispatched
      // epoch as the fence, then stop (no dispatcher wired).
      const fence: Fence = { epoch: decision.dispatch.epoch, holder };
      const claimRes = await backend.applyOps(ref, decision.ops, fence);
      out.applied.push(...claimRes.results);
      if (!claimRes.ok) { out.note = "claim lost"; outcomes.push(out); continue; }
      out.note = "no dispatcher configured";
      outcomes.push(out);
      continue;
    }

    if (decision.ops.length > 0) {
      const fence: Fence = { epoch: currentEpoch(card), holder };
      const res = await backend.applyOps(ref, decision.ops, fence);
      out.applied.push(...res.results);
    }
    outcomes.push(out);
  }
  return { outcomes };
}
