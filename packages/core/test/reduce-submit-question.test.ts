import { describe, it, expect } from "vitest";
import { reduceVerdict } from "../src/reduce.js";
import { LC, card } from "./fixtures/lifecycle.js";

describe("reduceVerdict submitted (P2b-2 T4)", () => {
  it("links a fresh PR on first submission (work)", () => {
    const ops = reduceVerdict(card({ stage: "development", pr: null }), { status: "submitted", evidence: { repo: "o/n", prNumber: 7, head: "abc" } }, LC);
    expect(ops.find((o) => o.kind === "linkPR")).toMatchObject({ number: 7, head: "abc", repo: "o/n" });
    expect(ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
  it("pushes the head over an existing PR (respawn submission)", () => {
    const ops = reduceVerdict(card({ stage: "development", pr: { number: 7, head: "old", files: [] } }), { status: "submitted", evidence: { repo: "o/n", prNumber: 7, head: "new" } }, LC);
    expect(ops.find((o) => o.kind === "pushHead")).toMatchObject({ head: "new" });
    expect(ops.some((o) => o.kind === "linkPR")).toBe(false);
    expect(ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
});

describe("reduceVerdict question (P2b-2 T4)", () => {
  it("blocks + asks + clears the lease", () => {
    const ops = reduceVerdict(card({ stage: "design" }), { status: "question", category: "product" }, LC);
    expect(ops.some((o) => o.kind === "setOverlay" && o.overlay === "blocked" && o.on)).toBe(true);
    expect(ops.find((o) => o.kind === "ask")).toMatchObject({ category: "product" });
    expect(ops.some((o) => o.kind === "clearLease")).toBe(true);
  });
});
