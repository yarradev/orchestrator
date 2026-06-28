import { describe, it, expect } from "vitest";
import { GitHubAdaptor } from "../src/github-adaptor.js";
import { InMemoryGitHubApi } from "../src/testing/in-memory-github-api.js";
import { makeCanonicalCard } from "@yarradev/core";

const ref = (id: string, stage: string) => ({ id, stage, type: "story" as const });

describe("GitHubAdaptor github-specific", () => {
  it("note writes ONE comment and dedupes on re-apply (observable via listComments)", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "a", stage: "dev" }));
    const note = { kind: "note" as const, body: "opened PR", key: "k1" };
    await b.applyOps(ref("a", "dev"), [note], { epoch: 0, holder: "orch" });
    await b.applyOps(ref("a", "dev"), [note], { epoch: 0, holder: "orch" });
    // find the issue number and assert exactly one yd:note=k1 comment
    const issues = await api.listIssues({});
    const cs = await api.listComments(issues[0].number);
    expect(cs.filter((c) => c.body.includes("yd:note=k1")).length).toBe(1);
  });

  it("readCard maps a linked PR + check rollup into pr/checks.ci", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "a", stage: "dev" }));
    const num = (await api.listIssues({}))[0].number;
    api.setLinkedPr(num, { number: 9, head: "abc", files: ["workers/api/src/index.ts"] });
    api.setCheckRollup("abc", "success");
    const card = await b.readCard(ref("a", "dev"));
    expect(card.pr).toEqual({ number: 9, head: "abc", files: ["workers/api/src/index.ts"] });
    expect(card.checks.ci).toBe("success");
  });

  it("veto is reported unsupported (deferred), not failed", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "a", stage: "dev" }));
    const r = await b.applyOps(ref("a", "dev"), [{ kind: "veto", role: "security-advisor", head: "h", reason: "x" }], { epoch: 0, holder: "orch" });
    expect(r.results[0].outcome).toBe("unsupported");
  });

  it("readCard finds a closed card (resolve uses state:all)", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "closed-1", stage: "done" }));
    const cardRef = { id: "closed-1", stage: "done", type: "story" as const };
    const fence = { epoch: 0, holder: "orch" };

    // close it via applyOps
    const r = await b.applyOps(cardRef, [{ kind: "close", from: "done", reason: "done" }], fence);
    expect(r.results[0].outcome).toBe("committed");

    // readCard must still find it despite state being "closed" (resolve uses state:all)
    const card = await b.readCard(cardRef);
    expect(card.state).toBe("closed");
    expect(card.stage).toBe("done");
  });

  it("setStage bumps transitions counter", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "t1", stage: "dev" }));
    const fence = { epoch: 0, holder: "orch" };

    await b.applyOps(
      { id: "t1", stage: "dev", type: "story" },
      [{ kind: "setStage", from: "dev", to: "test", epoch: 0 }],
      fence,
    );

    const card = await b.readCard({ id: "t1", stage: "test", type: "story" });
    expect(card.counters.transitions).toBe(1);
    expect(card.counters.bounces).toEqual({});
  });

  it("reject bumps transitions and bounces for the edge", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "t2", stage: "test" }));
    const fence = { epoch: 0, holder: "orch" };

    // First reject: test → dev
    await b.applyOps(
      { id: "t2", stage: "test", type: "story" },
      [{ kind: "reject", from: "test", to: "dev", epoch: 0, edge: "test→dev" }],
      fence,
    );
    // Second reject: dev → spec
    await b.applyOps(
      { id: "t2", stage: "dev", type: "story" },
      [{ kind: "reject", from: "dev", to: "spec", epoch: 0, edge: "dev→spec" }],
      fence,
    );

    const card = await b.readCard({ id: "t2", stage: "spec", type: "story" });
    expect(card.counters.transitions).toBe(2);
    expect(card.counters.bounces["test→dev"]).toBe(1);
    expect(card.counters.bounces["dev→spec"]).toBe(1);
  });

  it("setOverlay on → overlay in readCard.overlays; off → absent", async () => {
    const api = new InMemoryGitHubApi();
    const b = new GitHubAdaptor(api);
    await b.seedCard(makeCanonicalCard({ id: "ov1", stage: "dev" }));
    const ref = { id: "ov1", stage: "dev", type: "story" as const };
    const fence = { epoch: 0, holder: "orch" };

    // turn blocked on
    await b.applyOps(ref, [{ kind: "setOverlay", overlay: "blocked", on: true }], fence);
    let card = await b.readCard(ref);
    expect(card.overlays).toContain("blocked");

    // turn blocked off
    await b.applyOps(ref, [{ kind: "setOverlay", overlay: "blocked", on: false }], fence);
    card = await b.readCard(ref);
    expect(card.overlays).not.toContain("blocked");
  });
});
