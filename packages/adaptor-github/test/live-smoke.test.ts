import { describe, it, expect } from "vitest";
import { GitHubAdaptor } from "../src/github-adaptor.js";
import { GhCliGitHubApi } from "../src/gh-cli-github-api.js";
import { makeCanonicalCard } from "@yarradev/core";

const REPO = process.env.YD_GH_SMOKE_REPO ?? "";
describe.skipIf(!process.env.YD_GH_SMOKE || !REPO)("live smoke (real gh)", () => {
  it("seed → claim → setStage → note → readback against a real repo", async () => {
    const b = new GitHubAdaptor(new GhCliGitHubApi(REPO));
    const id = `smoke-${Date.now()}`;
    await b.seedCard(makeCanonicalCard({ id, stage: "dev", title: `yd live smoke ${id}` }));
    const ref = { id, stage: "dev", type: "story" as const };
    const c1 = await b.applyOps(ref, [{ kind: "claim", role: "developer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "smoke" });
    expect(c1.results[0].outcome).toBe("committed");
    const c2 = await b.applyOps(ref, [{ kind: "setStage", from: "dev", to: "test", epoch: 1 }], { epoch: 1, holder: "smoke" });
    expect(c2.results[0].outcome).toBe("committed");
    await b.applyOps(ref, [{ kind: "note", body: "smoke note", key: "smoke-note" }], { epoch: 1, holder: "smoke" });
    const card = await b.readCard({ id, stage: "test", type: "story" });
    expect(card.stage).toBe("test");
    await b.applyOps({ id, stage: "test", type: "story" }, [{ kind: "close", from: "test", reason: "smoke done" }], { epoch: 1, holder: "smoke" });
  });
});
