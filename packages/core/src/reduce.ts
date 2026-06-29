import type { CanonicalCard, Op, Verdict } from "./types.js";
import type { LifecycleConfig } from "./config.js";
import { escalateOps } from "./decide.js";

// reduceVerdict — the post-dispatch half of the decision brain. Maps a dispatched agent's in-band Verdict
// to the backend Op[] that records its outcome. Pure: no I/O, no clock. This is where eval-gates' retired
// §4 "terminal-act" logic re-lands. Worker verdicts end the owner's turn (they clear the lease in later
// tasks); advisor verdicts set advisor state — decide()'s gate acts on it on the next pass.
export function reduceVerdict(c: CanonicalCard, v: Verdict, lc: LifecycleConfig): Op[] {
  void lc; // stage resolution arrives in Task 2
  switch (v.status) {
    case "error":
      return escalateOps(c, `worker error: ${v.reason ?? "unspecified"}`);
    default:
      return escalateOps(c, `reduceVerdict: unhandled verdict (${v.status})`);
  }
}
