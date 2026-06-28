import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";

const ref = (id: string, stage: string) => ({ id, stage, type: "story" as const });
function fake(id: string, stage = "dev") {
  const b = new InMemoryBoardBackend(["done"]);
  b.seed(makeCanonicalCard({ id, stage }));
  return b;
}

describe("applyOps writes", () => {
  it("setStage applies on matching from and bumps transitions", async () => {
    const b = fake("a", "dev");
    const r = await b.applyOps(ref("a", "dev"),
      [{ kind: "setStage", from: "dev", to: "test", epoch: 1 }], { epoch: 1, holder: "orch" });
    expect(r.results[0].outcome).toBe("committed");
    const c = await b.readCard(ref("a", "test"));
    expect(c.stage).toBe("test");
    expect(c.counters.transitions).toBe(1);
  });

  it("setStage on a mismatched from is fenced (someone already moved it)", async () => {
    const b = fake("a", "test"); // already at test
    const r = await b.applyOps(ref("a", "test"),
      [{ kind: "setStage", from: "dev", to: "test", epoch: 1 }], { epoch: 1, holder: "orch" });
    expect(r.results[0].outcome).toBe("fenced");
    expect((await b.readCard(ref("a", "test"))).counters.transitions).toBe(0);
  });

  it("reject increments the per-edge bounce counter", async () => {
    const b = fake("a", "test");
    await b.applyOps(ref("a", "test"),
      [{ kind: "reject", from: "test", to: "dev", epoch: 1, edge: "test->dev" }], { epoch: 1, holder: "orch" });
    const c = await b.readCard(ref("a", "dev"));
    expect(c.stage).toBe("dev");
    expect(c.counters.bounces["test->dev"]).toBe(1);
  });

  it("note is idempotent by key — re-applying the same key does not duplicate", async () => {
    const b = fake("a", "dev");
    const note = { kind: "note" as const, body: "opened PR", key: "k1" };
    const r1 = await b.applyOps(ref("a", "dev"), [note], { epoch: 1, holder: "orch" });
    const r2 = await b.applyOps(ref("a", "dev"), [note], { epoch: 1, holder: "orch" });
    expect(r1.results[0].outcome).toBe("committed");
    expect(r2.results[0].outcome).toBe("committed"); // no-op, still committed
    expect(b.noteCount("a")).toBe(1);
  });
});
