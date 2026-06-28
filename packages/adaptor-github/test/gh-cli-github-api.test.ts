import { describe, it, expect } from "vitest";
import { GhCliGitHubApi, type GhExec } from "../src/gh-cli-github-api.js";

function recorder(responses: Record<string, string>) {
  const calls: string[][] = [];
  const exec: GhExec = async (args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(" "); // e.g. "issue list"
    if (key === "issue view" && responses["__notfound"]) throw new Error("not found");
    return responses[key] ?? responses[args.slice(0, 3).join(" ")] ?? "";
  };
  return { exec, calls };
}

describe("GhCliGitHubApi (injectable exec)", () => {
  it("listIssues builds args and maps labels/state", async () => {
    const { exec, calls } = recorder({
      "issue list": JSON.stringify([
        { number: 1, title: "A", body: "b", labels: [{ name: "stage:dev" }], state: "OPEN" },
      ]),
    });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    const out = await gh.listIssues({ labels: ["stage:dev"], state: "open" });
    expect(out).toEqual([{ number: 1, title: "A", body: "b", labels: ["stage:dev"], state: "open" }]);
    expect(calls[0]).toEqual([
      "issue", "list", "-R", "yarradev/x",
      "--json", "number,title,body,labels,state",
      "--limit", "200",
      "--state", "open",
      "--label", "stage:dev",
    ]);
  });

  it("listIssues with multiple labels builds repeated --label flags", async () => {
    const { exec, calls } = recorder({
      "issue list": JSON.stringify([]),
    });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    await gh.listIssues({ labels: ["stage:dev", "type:story"] });
    expect(calls[0]).toContain("--label");
    const idx = calls[0].indexOf("--label");
    expect(calls[0][idx + 1]).toBe("stage:dev");
    expect(calls[0][idx + 2]).toBe("--label");
    expect(calls[0][idx + 3]).toBe("type:story");
  });

  it("listIssues without state omits --state flag", async () => {
    const { exec, calls } = recorder({ "issue list": "[]" });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    await gh.listIssues({});
    expect(calls[0]).not.toContain("--state");
  });

  it("getIssue returns null when gh errors", async () => {
    const exec: GhExec = async () => {
      throw new Error("not found");
    };
    expect(await new GhCliGitHubApi("yarradev/x", exec).getIssue(99)).toBeNull();
  });

  it("getIssue parses and maps a single issue", async () => {
    const fixture = { number: 5, title: "T", body: "B", labels: [{ name: "bug" }], state: "CLOSED" };
    const { exec } = recorder({ "issue view": JSON.stringify(fixture) });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    const result = await gh.getIssue(5);
    expect(result).toEqual({ number: 5, title: "T", body: "B", labels: ["bug"], state: "closed" });
  });

  it("createIssue parses issue number from URL and calls getIssue", async () => {
    const issueFixture = {
      number: 42, title: "New card", body: "body text",
      labels: [{ name: "stage:dev" }], state: "OPEN",
    };
    const { exec, calls } = recorder({
      "issue create": "https://github.com/yarradev/x/issues/42\n",
      "issue view": JSON.stringify(issueFixture),
    });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    const result = await gh.createIssue({ title: "New card", body: "body text", labels: ["stage:dev"] });
    expect(calls[0]).toEqual([
      "issue", "create", "-R", "yarradev/x",
      "--title", "New card",
      "--body", "body text",
      "--label", "stage:dev",
    ]);
    expect(calls[1]).toEqual([
      "issue", "view", "42", "-R", "yarradev/x",
      "--json", "number,title,body,labels,state",
    ]);
    expect(result).toEqual({
      number: 42, title: "New card", body: "body text",
      labels: ["stage:dev"], state: "open",
    });
  });

  it("setLabels builds add/remove flags", async () => {
    const { exec, calls } = recorder({ "issue edit": "" });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    await gh.setLabels(5, ["stage:test"], ["stage:dev"]);
    expect(calls[0]).toEqual([
      "issue", "edit", "5", "-R", "yarradev/x",
      "--add-label", "stage:test",
      "--remove-label", "stage:dev",
    ]);
  });

  it("setLabels no-ops when both empty", async () => {
    const { exec, calls } = recorder({});
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    await gh.setLabels(5, [], []);
    expect(calls).toHaveLength(0);
  });

  it("setState calls issue close for closed", async () => {
    const { exec, calls } = recorder({ "issue close": "" });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    await gh.setState(3, "closed");
    expect(calls[0]).toEqual(["issue", "close", "3", "-R", "yarradev/x"]);
  });

  it("setState calls issue reopen for open", async () => {
    const { exec, calls } = recorder({ "issue reopen": "" });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    await gh.setState(3, "open");
    expect(calls[0]).toEqual(["issue", "reopen", "3", "-R", "yarradev/x"]);
  });

  it("listComments maps {comments:[{body}]}", async () => {
    const fixture = { comments: [{ body: "first" }, { body: "second" }] };
    const { exec } = recorder({ "issue view": JSON.stringify(fixture) });
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    const result = await gh.listComments(3);
    expect(result).toEqual([{ body: "first" }, { body: "second" }]);
  });

  it("getCheckRollup maps conclusions", async () => {
    const mk = (jq: string) => new GhCliGitHubApi("yarradev/x", async () => jq);
    expect(await mk(JSON.stringify(["success", "success"])).getCheckRollup("h")).toBe("success");
    expect(await mk(JSON.stringify(["success", "failure"])).getCheckRollup("h")).toBe("failure");
    expect(await mk(JSON.stringify(["queued"])).getCheckRollup("h")).toBe("pending");
    expect(await mk(JSON.stringify([])).getCheckRollup("h")).toBe("absent");
  });

  it("getCheckRollup: timed_out/cancelled/action_required all map to failure", async () => {
    for (const c of ["timed_out", "cancelled", "action_required"] as const) {
      const gh = new GhCliGitHubApi("yarradev/x", async () => JSON.stringify([c]));
      expect(await gh.getCheckRollup("h")).toBe("failure");
    }
  });

  it("getCheckRollup: in_progress maps to pending", async () => {
    const gh = new GhCliGitHubApi("yarradev/x", async () => JSON.stringify(["in_progress"]));
    expect(await gh.getCheckRollup("h")).toBe("pending");
  });

  it("getCheckRollup: skipped/neutral/stale are terminal non-failures → success", async () => {
    const mk = (cs: string[]) =>
      new GhCliGitHubApi("yarradev/x", async () => JSON.stringify(cs));
    expect(await mk(["success", "skipped"]).getCheckRollup("h")).toBe("success");
    expect(await mk(["neutral"]).getCheckRollup("h")).toBe("success");
    expect(await mk(["stale"]).getCheckRollup("h")).toBe("success");
    expect(await mk(["startup_failure"]).getCheckRollup("h")).toBe("failure");
    expect(await mk(["success", "failure"]).getCheckRollup("h")).toBe("failure");
  });

  it("resolveLinkedPr: dedupes multiple CrossReferencedEvent nodes for same PR", async () => {
    const gqlResponse = JSON.stringify({
      data: {
        repository: {
          issue: {
            timelineItems: {
              nodes: [
                { source: { number: 7, state: "OPEN" } },
                { source: { number: 7, state: "OPEN" } }, // duplicate event
              ],
            },
          },
        },
      },
    });
    const prViewResponse = JSON.stringify({
      number: 7,
      headRefOid: "abc123",
      files: [{ path: "src/index.ts" }],
    });
    const exec: GhExec = async (args) => {
      if (args[0] === "api" && args[1] === "graphql") return gqlResponse;
      if (args[0] === "pr") return prViewResponse;
      return "";
    };
    const gh = new GhCliGitHubApi("yarradev/x", exec);
    const pr = await gh.resolveLinkedPr(42);
    expect(pr).not.toBeNull();
    expect(pr!.number).toBe(7);
    expect(pr!.head).toBe("abc123");
  });
});
