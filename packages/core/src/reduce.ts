import type { CanonicalCard, Op, Verdict } from "./types.js";
import type { LifecycleConfig, StageDef } from "./config.js";
import { escalateOps, advanceOps } from "./decide.js";

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
    case "error":
      return escalateOps(c, `worker error: ${v.reason ?? "unspecified"}`);
    default:
      return escalateOps(c, `reduceVerdict: unhandled verdict (${v.status})`);
  }
}
