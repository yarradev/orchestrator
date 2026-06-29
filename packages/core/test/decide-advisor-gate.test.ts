import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { loadTeamPolicy } from "../src/config.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const TP = loadTeamPolicy({ advisors: [{ role: "security-advisor", authority: "veto", joins_at: ["development"], watch_paths: ["**/payments/**", "**/.env*"] }] });
const watched = (o: Partial<import("../src/types.js").CanonicalCard> = {}) =>
  card({ stage: "development", pr: { number: 9, head: "h1", files: ["src/payments/charge.ts"] }, checks: { ci: "success" }, ...o });

describe("decide advisor gate (P2b-2 T7)", () => {
  it("dispatches the advisor on a watch_paths match (corpus 23/24)", () => {
    const d = decide(watched(), LC, NOW, TP);
    expect(d.action).toBe("spawn");
    expect(d.dispatch).toMatchObject({ role: "security-advisor", mode: "judgement", respawn: false });
  });
  it("advances when no advisor watches this stage (default empty policy)", () => {
    expect(decide(watched(), LC, NOW).action).toBe("advance");
  });
  it("advances when changed files don't match watch_paths (corpus 25)", () => {
    expect(decide(watched({ pr: { number: 9, head: "h1", files: ["README.md"] } }), LC, NOW, TP).action).toBe("advance");
  });
  it("parks on an open VETO and sets veto-held (corpus 28)", () => {
    const d = decide(watched({ advisors: { "security-advisor": { vetoOpen: true, holdOpen: false } } }), LC, NOW, TP);
    expect(d.action).toBe("block");
    expect(d.ops.some((o) => o.kind === "setOverlay" && o.overlay === "veto-held" && o.on)).toBe(true);
    expect(d.ops.some((o) => o.kind === "note")).toBe(true);
  });
  it("escalates an open HOLD (corpus 37)", () => {
    const d = decide(watched({ advisors: { "security-advisor": { vetoOpen: false, holdOpen: true } } }), LC, NOW, TP);
    expect(d.action).toBe("block");
    expect(d.ops.some((o) => o.kind === "note")).toBe(true);
  });
  it("honors an open HOLD even when files drift off watch_paths (corpus 40)", () => {
    const d = decide(watched({ pr: { number: 9, head: "h1", files: ["README.md"] }, advisors: { "security-advisor": { vetoOpen: false, holdOpen: true } } }), LC, NOW, TP);
    expect(d.action).toBe("block");
  });
  it("VETO beats HOLD when both are open (corpus 41)", () => {
    const d = decide(watched({ advisors: { "security-advisor": { vetoOpen: true, holdOpen: true } } }), LC, NOW, TP);
    expect(d.ops.some((o) => o.kind === "setOverlay" && o.overlay === "veto-held")).toBe(true);
  });
  it("clears the lease when escalating a HOLD on an agent-running card (corpus 42)", () => {
    const d = decide(watched({ overlays: ["agent-running"], lease: { epoch: 1, holder: "o", role: "security-advisor", expiresAt: NOW + 100_000 }, advisors: { "security-advisor": { vetoOpen: false, holdOpen: true } } }), LC, NOW, TP);
    expect(d.ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
  it("advances after the advisor reviewed THIS head (corpus 27/48)", () => {
    expect(decide(watched({ advisors: { "security-advisor": { vetoOpen: false, holdOpen: false, reviewedHead: "h1" } } }), LC, NOW, TP).action).toBe("advance");
  });
  it("re-dispatches when the head moved past the reviewed sha (corpus 49)", () => {
    const d = decide(watched({ pr: { number: 9, head: "h2", files: ["src/payments/charge.ts"] }, advisors: { "security-advisor": { vetoOpen: false, holdOpen: false, reviewedHead: "h1" } } }), LC, NOW, TP);
    expect(d.action).toBe("spawn");
    expect(d.reason).toMatch(/head moved/);
  });
  it("noops while the advisor is already reviewing (lease held by advisor) (corpus 26)", () => {
    const d = decide(watched({ lease: { epoch: 2, holder: "o", role: "security-advisor", expiresAt: NOW + 100_000 } }), LC, NOW, TP);
    expect(d.action).toBe("noop");
    expect(d.reason).toMatch(/reviewing/);
  });
});
