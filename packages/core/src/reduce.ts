import type { CanonicalCard, Op, Verdict } from "./types.js";
import type { LifecycleConfig, StageDef } from "./config.js";
import { escalateOps, advanceOps, currentEpoch, keyFor } from "./decide.js";

// reduceVerdict — the post-dispatch half of the decision brain. Maps a dispatched agent's in-band Verdict
// to the backend Op[] that records its outcome. Pure: no I/O, no clock. This is where eval-gates' retired
// §4 "terminal-act" logic re-lands. Worker verdicts end the owner's turn (they clear the lease in later
// tasks); advisor verdicts set advisor state — decide()'s gate acts on it on the next pass.
export function reduceVerdict(c: CanonicalCard, v: Verdict, lc: LifecycleConfig): Op[] {
  const stagesCfg = c.type === "epic" ? (lc.epicStages ?? {}) : lc.stages;
  const st: StageDef | undefined = stagesCfg[c.stage];
  switch (v.status) {
    case "advance": {
      if (!st?.next) return escalateOps(c, `advance from ${c.stage} but it has no forward edge`);
      if (v.to && v.to !== st.next) return escalateOps(c, `MOVE names to-stage:${v.to} but ${c.stage}'s only forward edge is →${st.next}`);
      return advanceOps(c, st, stagesCfg);
    }
    case "reject": {
      const edge = `${c.stage}->${v.to}`;
      if (!v.to || !lc.backwardEdges[edge]) return escalateOps(c, `REJECT on undefined backward edge ${c.stage}->${v.to ?? "?"}`);
      return [
        { kind: "reject", from: c.stage, to: v.to, epoch: currentEpoch(c), edge },
        { kind: "clearLease", epoch: currentEpoch(c) },
      ];
    }
    case "submitted": {
      const ev = v.evidence;
      const link: Op = c.pr == null
        ? { kind: "linkPR", number: ev.prNumber, head: ev.head, repo: ev.repo }
        : { kind: "pushHead", head: ev.head };
      return [link, { kind: "clearLease", epoch: currentEpoch(c) }];
    }
    case "question":
      return [
        { kind: "setOverlay", overlay: "blocked", on: true },
        { kind: "ask", category: v.category, body: `Blocking question (cat:${v.category}) needs an answer.`, key: keyFor(c, "ask") },
        { kind: "clearLease", epoch: currentEpoch(c) },
      ];
    case "error":
      return escalateOps(c, `worker error: ${v.reason ?? "unspecified"}`);
    case "veto":
      return [{ kind: "veto", role: v.role, head: v.head, reason: v.reason ?? "" }];
    case "hold":
      return [{ kind: "hold", role: v.role, head: v.head, reason: v.reason ?? "" }];
    case "advice":
      return [
        { kind: "recordReview", role: v.role, head: v.head },
        { kind: "note", body: `ADVICE from ${v.role}: ${v.reason ?? ""}`, key: keyFor(c, `advice:${v.role}`) },
      ];
    case "clean":
      return [{ kind: "recordReview", role: v.role, head: v.head }];
    default: {
      const _exhaustive: never = v;
      return escalateOps(c, `reduceVerdict: unhandled verdict (${(_exhaustive as { status: string }).status})`);
    }
  }
}
