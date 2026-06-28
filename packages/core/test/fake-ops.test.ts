import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";
import type { CardRef, Fence } from "../src/types.js";

const ref = (id: string): CardRef => ({ id, stage: "development", type: "story" });
const fence: Fence = { epoch: 0, holder: "orch" };

describe("InMemoryBoardBackend setOverlay (P2a)", () => {
  it("adds and removes overlays idempotently", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c1", stage: "development" }));
    let r = await be.applyOps(ref("c1"), [{ kind: "setOverlay", overlay: "blocked", on: true }], fence);
    expect(r.ok).toBe(true);
    expect((await be.readCard(ref("c1"))).overlays).toEqual(["blocked"]);
    await be.applyOps(ref("c1"), [{ kind: "setOverlay", overlay: "blocked", on: true }], fence); // idempotent
    expect((await be.readCard(ref("c1"))).overlays).toEqual(["blocked"]);
    r = await be.applyOps(ref("c1"), [{ kind: "setOverlay", overlay: "blocked", on: false }], fence);
    expect(r.ok).toBe(true);
    expect((await be.readCard(ref("c1"))).overlays).toEqual([]);
  });
});
