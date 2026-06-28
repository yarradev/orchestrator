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
});
