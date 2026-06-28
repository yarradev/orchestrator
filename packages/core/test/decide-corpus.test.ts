import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const ROWS = [
  { name: "testing mechanical tests_green → advance to done (case 9)",
    c: card({ stage: "testing", pr: { number: 9, head: "x", files: [] }, checks: { ci: "absent", tests: "success" } }), now: NOW, action: "advance" },
  { name: "mechanical failure + live unexpired lease → noop, no double-spawn (case 21)",
    c: card({ stage: "development", epoch: 1, pr: { number: 9, head: "x", files: [] }, checks: { ci: "failure" }, lease: { epoch: 1, holder: "o", role: "developer", expiresAt: NOW + 50_000 } }), now: NOW, action: "noop" },
  { name: "active lease past ttl (default skew) → reclaim (case 22)",
    c: card({ stage: "development", epoch: 1, lease: { epoch: 1, holder: "o", role: "developer", expiresAt: NOW - 300_000 /* must exceed the 120s skew guard */ } }), now: NOW, action: "reclaim" },
];

describe("decide corpus (P2b-1 T9)", () => {
  for (const r of ROWS) it(r.name, () => expect(decide(r.c, LC, r.now).action).toBe(r.action));
});
