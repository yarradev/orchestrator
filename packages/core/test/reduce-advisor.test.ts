import { describe, it, expect } from "vitest";
import { reduceVerdict } from "../src/reduce.js";
import { LC, card } from "./fixtures/lifecycle.js";

const dev = () => card({ stage: "development" });

describe("reduceVerdict advisor verdicts (P2b-2 T5)", () => {
  it("veto → a veto op (decide's gate sets veto-held next pass)", () => {
    const ops = reduceVerdict(dev(), { status: "veto", role: "security-advisor", head: "abc", reason: "unsafe" }, LC);
    expect(ops).toEqual([{ kind: "veto", role: "security-advisor", head: "abc", reason: "unsafe" }]);
  });
  it("hold → a hold op", () => {
    const ops = reduceVerdict(dev(), { status: "hold", role: "security-advisor", head: "abc", reason: "sign-off" }, LC);
    expect(ops).toEqual([{ kind: "hold", role: "security-advisor", head: "abc", reason: "sign-off" }]);
  });
  it("advice → recordReview + a note", () => {
    const ops = reduceVerdict(dev(), { status: "advice", role: "security-advisor", head: "abc", reason: "nit" }, LC);
    expect(ops.find((o) => o.kind === "recordReview")).toMatchObject({ role: "security-advisor", head: "abc" });
    expect(ops.some((o) => o.kind === "note")).toBe(true);
  });
  it("clean → recordReview only", () => {
    const ops = reduceVerdict(dev(), { status: "clean", role: "security-advisor", head: "abc" }, LC);
    expect(ops).toEqual([{ kind: "recordReview", role: "security-advisor", head: "abc" }]);
  });
});
