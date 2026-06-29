import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import type { CanonicalCard } from "../src/types.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const prCard = (o: Partial<CanonicalCard>) => card({ stage: "development", pr: { number: 9, head: "abc", files: [] }, ...o });

describe("decide mechanical CI gate (P2b-1 T7)", () => {
  it("advances on green CI with a PR (case 5)", () => {
    const d = decide(prCard({ checks: { ci: "success" } }), LC, NOW);
    expect(d.action).toBe("advance");
    expect(d.ops.some((o) => o.kind === "setStage" && o.to === "testing")).toBe(true);
  });
  it("noops on pending CI (case 6)", () => {
    expect(decide(prCard({ checks: { ci: "pending" } }), LC, NOW).action).toBe("noop");
  });
  it("noops fail-closed on absent CI (case 8)", () => {
    expect(decide(prCard({ checks: { ci: "absent" } }), LC, NOW).action).toBe("noop");
  });
  it("escalates when CI keeps failing past the respawn limit", () => {
    const d = decide(prCard({ checks: { ci: "failure" }, counters: { transitions: 0, bounces: {}, respawns: 3 } }), LC, NOW);
    expect(d.action).toBe("escalate");
    expect(d.reason).toMatch(/respawn/);
  });
});
