import { describe, it, expect } from "vitest";
import { InMemoryGitHubApi } from "../src/testing/in-memory-github-api.js";

describe("InMemoryGitHubApi", () => {
  it("createIssue assigns sequential numbers and opens the issue", async () => {
    const gh = new InMemoryGitHubApi();
    const a = await gh.createIssue({ title: "A", body: "body-a", labels: ["stage:dev"] });
    const b = await gh.createIssue({ title: "B", body: "body-b" });
    expect(a.number).toBe(1);
    expect(b.number).toBe(2);
    expect(a.state).toBe("open");
    expect(a.labels).toEqual(["stage:dev"]);
  });

  it("listIssues filters by state and by all-of labels", async () => {
    const gh = new InMemoryGitHubApi();
    await gh.createIssue({ title: "A", body: "", labels: ["stage:dev", "type:story"] });
    await gh.createIssue({ title: "B", body: "", labels: ["stage:done"] });
    const dev = await gh.listIssues({ labels: ["stage:dev"], state: "open" });
    expect(dev.map((i) => i.title)).toEqual(["A"]);
    const both = await gh.listIssues({ labels: ["stage:dev", "type:story"] });
    expect(both.map((i) => i.title)).toEqual(["A"]);
  });

  it("setLabels adds and removes (set semantics, no dupes)", async () => {
    const gh = new InMemoryGitHubApi();
    const i = await gh.createIssue({ title: "A", body: "", labels: ["stage:dev"] });
    await gh.setLabels(i.number, ["stage:test"], ["stage:dev"]);
    await gh.setLabels(i.number, ["stage:test"], []); // re-add is a no-op
    expect((await gh.getIssue(i.number))!.labels).toEqual(["stage:test"]);
  });

  it("setState, updateBody, and comments work; reads are isolated copies", async () => {
    const gh = new InMemoryGitHubApi();
    const i = await gh.createIssue({ title: "A", body: "v1" });
    await gh.updateBody(i.number, "v2");
    await gh.setState(i.number, "closed");
    await gh.comment(i.number, "first");
    await gh.comment(i.number, "second");
    const got = (await gh.getIssue(i.number))!;
    expect(got.body).toBe("v2");
    expect(got.state).toBe("closed");
    got.labels.push("mutation-should-not-leak");
    expect((await gh.getIssue(i.number))!.labels).toEqual([]); // copy isolation
    expect((await gh.listComments(i.number)).map((c) => c.body)).toEqual(["first", "second"]);
  });

  it("getIssue returns null for a missing issue; mutating a missing issue throws", async () => {
    const gh = new InMemoryGitHubApi();
    expect(await gh.getIssue(999)).toBeNull();
    await expect(gh.setLabels(999, ["x"], [])).rejects.toThrow(/no such issue/);
  });

  it("VCS fixtures: resolveLinkedPr + getCheckRollup default empty, return what was set", async () => {
    const gh = new InMemoryGitHubApi();
    const i = await gh.createIssue({ title: "A", body: "" });
    expect(await gh.resolveLinkedPr(i.number)).toBeNull();
    expect(await gh.getCheckRollup("deadbeef")).toBe("absent");
    gh.setLinkedPr(i.number, { number: 7, head: "deadbeef", files: ["workers/api/src/index.ts"] });
    gh.setCheckRollup("deadbeef", "success");
    expect(await gh.resolveLinkedPr(i.number)).toEqual({ number: 7, head: "deadbeef", files: ["workers/api/src/index.ts"] });
    expect(await gh.getCheckRollup("deadbeef")).toBe("success");
  });
});
