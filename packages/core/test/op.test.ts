import { describe, it, expect } from "vitest";
import type { Op } from "../src/types.js";

describe("Op union extensions (P2a)", () => {
  it("constructs hold / ask / linkPR / pushHead ops", () => {
    const ops: Op[] = [
      { kind: "hold", role: "security-advisor", head: "abc123", reason: "compliance sign-off" },
      { kind: "ask", category: "product", body: "Which currency?", key: "k1" },
      { kind: "linkPR", number: 42, head: "abc123", repo: "owner/name" },
      { kind: "pushHead", head: "def456" },
    ];
    expect(ops.map((o) => o.kind)).toEqual(["hold", "ask", "linkPR", "pushHead"]);
  });
});
