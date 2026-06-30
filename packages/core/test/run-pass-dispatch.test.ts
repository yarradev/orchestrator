import { describe, it, expect } from "vitest";
import { runPass } from "../src/run.js";
import { decide } from "../src/decide.js";
import { reduceVerdict } from "../src/reduce.js";
import { FakeDispatcher } from "../src/testing/fake-dispatcher.js";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import type { TeamPolicy } from "../src/config.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const ref = (id: string, stage: string) => ({ id, stage, type: "story" as const });
const mk = () => new InMemoryBoardBackend(["done"]);

describe("runPass — dispatch leg + FakeDispatcher (P2c T3)", () => {
  it("claims, dispatches, applies the advance verdict, clears the lease (round-trip)", async () => {
    const b = mk();
    b.seed(card({ id: "1", stage: "design", epoch: 0 }));
    const disp = new FakeDispatcher({ status: "advance" });
    const report = await runPass({ backend: b, lc: LC, dispatcher: disp, now: () => NOW });

    const o = report.outcomes[0]!;
    expect(o.action).toBe("spawn");
    expect(o.dispatched).toMatchObject({ role: "designer", epoch: 1 });
    expect(o.verdict).toEqual({ status: "advance" });
    expect(disp.requests).toHaveLength(1);
    expect(disp.requests[0]).toMatchObject({ role: "designer", epoch: 1, mode: "judgement" });

    const after = await b.readCard(ref("1", "development"));
    expect(after.stage).toBe("development");   // advanced
    expect(after.lease).toBeNull();            // reduceVerdict cleared it (loop added none)
    expect(after.counters.transitions).toBe(1);
    // NOTE: durable epoch monotonicity (after.epoch, next-dispatch=2) is proven in the
    // fake-epoch task + the shared contract assertion — not asserted here.
  });

  it("submitted verdict links the PR and clears the lease", async () => {
    const b = mk();
    b.seed(card({ id: "5", stage: "development", epoch: 1, pr: null }));   // mechanical, no PR -> spawn developer
    const disp = new FakeDispatcher({ status: "submitted", evidence: { repo: "a/b", prNumber: 9, head: "cafe" } });
    await runPass({ backend: b, lc: LC, dispatcher: disp, now: () => NOW });
    const after = await b.readCard(ref("5", "development"));
    expect(after.pr).toMatchObject({ number: 9, head: "cafe" });
    expect(after.lease).toBeNull();
  });

  it("a VETO verdict round-trips to a held park on the next decide; the veto path clears a running lease", async () => {
    const policy: TeamPolicy = { advisors: [{ role: "security", joinsAt: ["development"], watchPaths: ["**/auth*"] }] };
    // reduceVerdict(veto) -> fake -> the advisor flag is set
    const seed = card({ id: "6", stage: "development", epoch: 2, pr: { number: 3, head: "h", files: ["src/auth.ts"] }, checks: { ci: "success" } });
    const b = mk();
    b.seed(seed);
    const ops = reduceVerdict(seed, { status: "veto", role: "security", head: "h", reason: "sqli" }, LC);
    await b.applyOps(ref("6", "development"), ops, { epoch: 2, holder: "orch" });
    const reread = await b.readCard(ref("6", "development"));
    const d = decide(reread, LC, NOW, policy);
    expect(d.action).toBe("block");
    expect(d.ops.some((o) => o.kind === "setOverlay" && o.overlay === "veto-held" && o.on)).toBe(true);

    // VETO + agent-running -> the gate clears the running lease (carryover coverage gap)
    const running = card({ id: "7", stage: "development", epoch: 2, overlays: ["agent-running"], lease: { epoch: 2, holder: "orch", role: "developer", expiresAt: NOW + 1000 }, pr: { number: 4, head: "h2", files: ["x"] }, checks: { ci: "success" }, advisors: { security: { vetoOpen: true, holdOpen: false, vetoEver: true } } });
    const dv = decide(running, LC, NOW, policy);
    expect(dv.action).toBe("block");
    expect(dv.ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
});
