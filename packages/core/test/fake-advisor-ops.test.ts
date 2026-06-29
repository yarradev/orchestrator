import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";
import type { CardRef, Fence } from "../src/types.js";

const ref = (id: string): CardRef => ({ id, stage: "development", type: "story" });
const fence: Fence = { epoch: 0, holder: "orch" };

describe("InMemoryBoardBackend advisor ops (P2b-2 T6)", () => {
  it("veto sets vetoOpen/vetoEver/reviewedHead; clearVeto clears vetoOpen but keeps vetoEver", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c1", stage: "development" }));
    await be.applyOps(ref("c1"), [{ kind: "veto", role: "security-advisor", head: "h1", reason: "x" }], fence);
    expect((await be.readCard(ref("c1"))).advisors["security-advisor"]).toMatchObject({ vetoOpen: true, vetoEver: true, reviewedHead: "h1" });
    await be.applyOps(ref("c1"), [{ kind: "clearVeto", role: "security-advisor" }], fence);
    expect((await be.readCard(ref("c1"))).advisors["security-advisor"]).toMatchObject({ vetoOpen: false, vetoEver: true });
  });
  it("hold sets holdOpen + reviewedHead", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c2", stage: "development" }));
    await be.applyOps(ref("c2"), [{ kind: "hold", role: "security-advisor", head: "h2", reason: "y" }], fence);
    expect((await be.readCard(ref("c2"))).advisors["security-advisor"]).toMatchObject({ holdOpen: true, reviewedHead: "h2" });
  });
  it("recordReview sets reviewedHead without opening a veto/hold", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c3", stage: "development" }));
    await be.applyOps(ref("c3"), [{ kind: "recordReview", role: "security-advisor", head: "h3" }], fence);
    expect((await be.readCard(ref("c3"))).advisors["security-advisor"]).toMatchObject({ reviewedHead: "h3", vetoOpen: false, holdOpen: false });
  });
});
