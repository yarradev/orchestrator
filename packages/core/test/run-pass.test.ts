import { describe, it, expect } from "vitest";
import { runPass } from "../src/run.js";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const mk = () => new InMemoryBoardBackend(["done"]);

describe("runPass — non-dispatch + dry-run (P2c T2)", () => {
  it("dry-run reports the decision for a fresh card and writes NOTHING", async () => {
    const b = mk();
    b.seed(card({ id: "1", stage: "design", epoch: 0 }));
    const report = await runPass({ backend: b, lc: LC, now: () => NOW }, { dryRun: true });
    expect(report.outcomes).toHaveLength(1);
    const o = report.outcomes[0]!;
    expect(o.action).toBe("spawn");
    expect(o.dispatched).toMatchObject({ role: "designer", epoch: 1 });
    expect(o.note).toBe("dry-run");
    expect(o.applied).toEqual([]);
    // nothing mutated: no lease was claimed
    expect((await b.readCard({ id: "1", stage: "design", type: "story" })).lease).toBeNull();
  });

  it("applies the ops of a non-dispatch decision (escalate a malformed card)", async () => {
    const b = mk();
    b.seed(card({ id: "2", stage: "design", epoch: 0, malformed: ["bad stage label"] }));
    const report = await runPass({ backend: b, lc: LC, now: () => NOW });
    const o = report.outcomes[0]!;
    expect(o.action).toBe("escalate");
    expect(o.applied.every((r) => r.outcome === "committed")).toBe(true);
    expect((await b.readCard({ id: "2", stage: "design", type: "story" })).overlays).toContain("escalated");
  });

  it("excludes escalated cards from the pass", async () => {
    const b = mk();
    b.seed(card({ id: "3", stage: "design", epoch: 0, overlays: ["escalated"] }));
    const report = await runPass({ backend: b, lc: LC, now: () => NOW });
    expect(report.outcomes).toHaveLength(0);
  });

  it("records 'no dispatcher configured' when a dispatch is needed but none is injected", async () => {
    const b = mk();
    b.seed(card({ id: "4", stage: "design", epoch: 0 }));
    const report = await runPass({ backend: b, lc: LC, now: () => NOW }); // not dry-run, no dispatcher
    const o = report.outcomes[0]!;
    expect(o.note).toBe("no dispatcher configured");
    // the claim WAS applied (fence proof): lease now held at the dispatched epoch
    expect((await b.readCard({ id: "4", stage: "design", type: "story" })).lease).toMatchObject({ epoch: 1, role: "designer" });
  });
});
