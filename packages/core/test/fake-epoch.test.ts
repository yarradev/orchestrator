import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";

const ref = { id: "a", stage: "dev", type: "story" as const };
const seedFake = () => { const b = new InMemoryBoardBackend(["done"]); b.seed(makeCanonicalCard({ id: "a", stage: "dev" })); return b; };

describe("fake durable epoch high-water (P2c T4)", () => {
  it("a claim bumps the card's durable epoch", async () => {
    const b = seedFake();
    await b.applyOps(ref, [{ kind: "claim", role: "developer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
    expect((await b.readCard(ref)).epoch).toBe(1);
  });
  it("the durable epoch persists past clearLease and is monotonic", async () => {
    const b = seedFake();
    await b.applyOps(ref, [{ kind: "claim", role: "developer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
    await b.applyOps(ref, [{ kind: "clearLease", epoch: 1 }], { epoch: 1, holder: "orch" });
    expect((await b.readCard(ref)).epoch).toBe(1);   // survives release
    await b.applyOps(ref, [{ kind: "claim", role: "developer", epoch: 2, ttlS: 1800 }], { epoch: 1, holder: "orch" });
    expect((await b.readCard(ref)).epoch).toBe(2);
  });
});
