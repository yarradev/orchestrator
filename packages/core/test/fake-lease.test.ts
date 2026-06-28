import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";

const states = ["spec", "dev", "test", "done"];
function fakeWith(id: string, over = {}) {
  const b = new InMemoryBoardBackend(states, ["done"]);
  b.seed(makeCanonicalCard({ id, ...over }));
  return b;
}

describe("applyOps claim/clearLease + fence", () => {
  it("claim sets a lease at epoch 1 from a no-lease card", async () => {
    const b = fakeWith("a");
    const r = await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "claim", role: "designer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
    expect(r.ok).toBe(true);
    expect(r.results[0].outcome).toBe("committed");
    const c = await b.readCard({ id: "a", stage: "spec", type: "story" });
    expect(c.lease).toMatchObject({ epoch: 1, role: "designer" });
  });

  it("an op with a stale epoch against a live lease is fenced", async () => {
    const b = fakeWith("a");
    await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "claim", role: "designer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
    const r = await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "clearLease", epoch: 0 }], { epoch: 0, holder: "orch" }); // stale
    expect(r.ok).toBe(false);
    expect(r.results[0].outcome).toBe("fenced");
  });

  it("clearLease at the live epoch releases the lease", async () => {
    const b = fakeWith("a");
    await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "claim", role: "designer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
    const r = await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "clearLease", epoch: 1 }], { epoch: 1, holder: "orch" });
    expect(r.results[0].outcome).toBe("committed");
    const c = await b.readCard({ id: "a", stage: "spec", type: "story" });
    expect(c.lease).toBeNull();
  });

  it("claim on a card that already has a live lease is fenced (single-owner)", async () => {
    const b = fakeWith("a");
    await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "claim", role: "designer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
    const r = await b.applyOps({ id: "a", stage: "spec", type: "story" },
      [{ kind: "claim", role: "developer", epoch: 2, ttlS: 1800 }], { epoch: 1, holder: "orch" });
    expect(r.results[0].outcome).toBe("fenced");
  });
});
