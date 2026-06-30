import { describe, it, expect } from "vitest";
import { BoardAdaptor } from "../src/board-adaptor.js";
import { FakeBoardApi } from "../src/testing/fake-board-api.js";

describe("BoardAdaptor", () => {
  it("capabilities match the spec", () => {
    const a = new BoardAdaptor(new FakeBoardApi() as any);
    expect(a.capabilities).toMatchObject({
      ci: "push",
      fencing: "orchestrator",
      prDiff: false,
    });
  });

  it("listReady calls listCards and filters escalated", async () => {
    const api = new FakeBoardApi();
    api.seed({ id: "1", type: "story", stage: "dev", state: "open", current_gen: 1, title: "ok",
      blocked: false, veto_held: false, hold_open: false, ci_rollup: "absent", lease_role: null, lease_gen: null,
      lease_expiry_ts: null, linked_head_sha: null, transitions_count: 0, parent_id: null, escalated: false,
      open_questions: [], answered_questions: [], notes: [], vetoes: [], holds: [], escalated_reason: null });
    api.seed({ id: "2", type: "story", stage: "dev", state: "open", current_gen: 1, title: "esc",
      blocked: false, veto_held: false, hold_open: false, ci_rollup: "absent", lease_role: null, lease_gen: null,
      lease_expiry_ts: null, linked_head_sha: null, transitions_count: 0, parent_id: null, escalated: true,
      open_questions: [], answered_questions: [], notes: [], vetoes: [], holds: [], escalated_reason: "test" });

    const adaptor = new BoardAdaptor(api as any);
    const refs = await adaptor.listReady({ excludeOverlays: ["escalated"] });
    expect(refs).toEqual([{ id: "1", stage: "dev", type: "story" }]);
  });
});
