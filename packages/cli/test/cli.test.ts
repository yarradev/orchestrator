import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "@yarradev/core/testing";
import { loadLifecycle, loadTeamPolicy, makeCanonicalCard } from "@yarradev/core";
import type { BoardBackend } from "@yarradev/core";
import { run } from "../src/cli.js";

const RAW = {
  entry_stage: "design",
  stages: {
    design: { owner_role: "designer", gate: "judgement", advance_on: "plan_posted", next: "development" },
    development: { owner_role: "developer", gate: "mechanical", advance_on: "ci_green", next: "done" },
    done: { terminal: true },
  },
  backward_edges: {}, budgets: { transition_budget: 12, bounce_limit: 3 }, lease: { ttl_seconds: 1800, skew_guard_seconds: 0 },
};
const configs = { lc: loadLifecycle(RAW), policy: loadTeamPolicy({ advisors: [] }) };

function harness() {
  const lines: string[] = []; const errs: string[] = [];
  const io = { out: (s: string) => lines.push(s), err: (s: string) => errs.push(s) };
  const backend = new InMemoryBoardBackend(["done"]);
  backend.seed(makeCanonicalCard({ id: "1", stage: "design", epoch: 0 }));
  const deps = { mkBackend: (): BoardBackend => backend, loadConfigs: () => configs };
  return { io, lines, errs, deps, backend };
}

describe("yarradev CLI deterministic commands (P2c T7)", () => {
  it("list-ready prints the ready refs as JSON", async () => {
    const h = harness();
    const code = await run(["list-ready"], {}, h.io, h.deps);
    expect(code).toBe(0);
    expect(JSON.parse(h.lines.join("\n"))).toEqual([{ id: "1", stage: "design", type: "story" }]);
  });
  it("read-card prints the canonical card", async () => {
    const h = harness();
    const code = await run(["read-card", "1", "design"], {}, h.io, h.deps);
    expect(code).toBe(0);
    expect(JSON.parse(h.lines.join("\n"))).toMatchObject({ id: "1", stage: "design" });
  });
  it("decide prints the decision", async () => {
    const h = harness();
    const code = await run(["decide", "1", "design"], {}, h.io, h.deps);
    expect(code).toBe(0);
    expect(JSON.parse(h.lines.join("\n"))).toMatchObject({ action: "spawn", dispatch: { role: "designer" } });
  });
  it("reduce prints the ops for a verdict", async () => {
    const h = harness();
    const code = await run(["reduce", "1", "design", JSON.stringify({ status: "advance" })], {}, h.io, h.deps);
    expect(code).toBe(0);
    const ops = JSON.parse(h.lines.join("\n"));
    expect(ops.some((o: { kind: string }) => o.kind === "setStage")).toBe(true);
  });
  it("returns a usage error (exit 2) on a missing argument", async () => {
    const h = harness();
    expect(await run(["read-card", "1"], {}, h.io, h.deps)).toBe(2);
  });
  it("returns exit 2 on an unknown command", async () => {
    const h = harness();
    expect(await run(["frobnicate"], {}, h.io, h.deps)).toBe(2);
  });
});
