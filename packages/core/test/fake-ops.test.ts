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

describe("InMemoryBoardBackend close/ask/linkPR/pushHead (P2a)", () => {
  it("close moves state to closed with a from-guard", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c3", stage: "testing" }));
    const bad = await be.applyOps(ref("c3"), [{ kind: "close", from: "development", reason: "x" }], fence);
    expect(bad.results[0]!.outcome).toBe("fenced"); // stage testing != from development
    const ok = await be.applyOps({ id: "c3", stage: "testing", type: "story" }, [{ kind: "close", from: "testing", reason: "done" }], fence);
    expect(ok.ok).toBe(true);
    expect((await be.readCard(ref("c3"))).state).toBe("closed");
  });

  it("ask dedupes by key like note", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c4", stage: "design" }));
    await be.applyOps(ref("c4"), [{ kind: "ask", category: "product", body: "q?", key: "k1" }], fence);
    await be.applyOps(ref("c4"), [{ kind: "ask", category: "product", body: "q?", key: "k1" }], fence);
    expect(be.noteCount("c4")).toBe(1);
  });

  it("linkPR then pushHead update the PR", async () => {
    const be = new InMemoryBoardBackend(["done"]);
    be.seed(makeCanonicalCard({ id: "c5", stage: "development" }));
    await be.applyOps(ref("c5"), [{ kind: "linkPR", number: 7, head: "aaa", repo: "o/n" }], fence);
    expect((await be.readCard(ref("c5"))).pr).toEqual({ number: 7, head: "aaa", files: [] });
    await be.applyOps(ref("c5"), [{ kind: "pushHead", head: "bbb" }], fence);
    expect((await be.readCard(ref("c5"))).pr?.head).toBe("bbb");
  });
});
