import { describe, it, expect } from "vitest";
import { opToAct, appendOutcomeToOpResult, mapEnrichedToCanonical } from "../src/conventions.js";
import type { EnrichedBoardCard } from "@yarrasys/board-client";

describe("opToAct", () => {
  it("maps claim -> CLAIM with gen=null", () => {
    const act = opToAct({ kind: "claim", role: "developer", epoch: 3, ttlS: 1800 }, "c1", 3);
    expect(act).toMatchObject({ type: "CLAIM", item_id: "c1", gen: null });
  });
  it("maps setStage -> MOVE with gen-required", () => {
    const act = opToAct({ kind: "setStage", from: "dev", to: "test", epoch: 3 }, "c1", 3);
    expect(act).toMatchObject({ type: "MOVE", gen: 3, data: { from: "dev", to: "test" } });
  });
  it("maps reject -> REJECT", () => {
    const act = opToAct({ kind: "reject", from: "dev", to: "design", epoch: 3, edge: "dev->design" }, "c1", 3);
    expect(act).toMatchObject({ type: "REJECT", gen: 3, data: { from: "dev", to: "design", edge: "dev->design" } });
  });
  it("maps clearLease -> CLEAR_LEASE", () => {
    const act = opToAct({ kind: "clearLease", epoch: 3 }, "c1", 3);
    expect(act).toMatchObject({ type: "CLEAR_LEASE", gen: 3 });
  });
  it("maps note -> NOTE with idempotency_key", () => {
    const act = opToAct({ kind: "note", key: "abc", body: "hello" }, "c1", 3);
    expect(act).toMatchObject({ type: "NOTE", gen: null, data: { body: "hello" } });
    expect(act!.idempotency_key).toBe("c1:3:note:abc");
  });
  it("returns null for unsupported ops", () => {
    expect(opToAct({ kind: "setOverlay", overlay: "blocked", on: true }, "c1", 3)).toBeNull();
  });
});

describe("appendOutcomeToOpResult", () => {
  it("committed -> committed", () => {
    expect(appendOutcomeToOpResult("committed")).toBe("committed");
  });
  it("fenced -> fenced", () => {
    expect(appendOutcomeToOpResult("fenced")).toBe("fenced");
  });
  it("gate_blocked -> gate_blocked", () => {
    expect(appendOutcomeToOpResult("gate_blocked")).toBe("gate_blocked");
  });
  it("unauthorized -> fenced", () => {
    expect(appendOutcomeToOpResult("unauthorized")).toBe("fenced");
  });
  it("bad_act -> failed", () => {
    expect(appendOutcomeToOpResult("bad_act")).toBe("failed");
  });
  it("conflict_idem -> committed", () => {
    expect(appendOutcomeToOpResult("conflict_idem")).toBe("committed");
  });
});

describe("mapEnrichedToCanonical", () => {
  it("maps an enriched card to canonical shape", () => {
    const ec: EnrichedBoardCard = {
      id: "c1", type: "story", state: "open", current_gen: 2, blocked: false, veto_held: false, hold_open: false,
      ci_rollup: "success", lease_role: "developer", lease_gen: 2, lease_expiry_ts: 999, linked_head_sha: "abc",
      transitions_count: 1, title: "test", parent_id: null, escalated: false, stage: "dev",
      open_questions: [], answered_questions: [], notes: [], vetoes: [], holds: [], escalated_reason: null,
    };
    const cc = mapEnrichedToCanonical(ec);
    expect(cc.id).toBe("c1");
    expect(cc.epoch).toBe(2);
    expect(cc.lease).toMatchObject({ role: "developer", epoch: 2 });
    expect(cc.checks.ci).toBe("success");
    expect(cc.pr?.head).toBe("abc");
  });
});
