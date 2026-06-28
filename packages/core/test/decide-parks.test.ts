import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const q = (o: object) => ({ open: 1, blocking: { category: "product", answered: false, deadlinePassed: false, answerPending: false, ...o } });

describe("decide blocked park + block (P2b-1 T4)", () => {
  it("blocks an open unanswered question (case 11)", () => {
    const d = decide(card({ stage: "design", questions: q({}) }), LC, NOW);
    expect(d.action).toBe("block");
    expect(d.ops.some((o) => o.kind === "setOverlay" && o.overlay === "blocked" && o.on)).toBe(true);
    expect(d.ops.some((o) => o.kind === "ask")).toBe(true);
  });
  it("unblocks when an answer is pending (case 12)", () => {
    const d = decide(card({ stage: "design", overlays: ["blocked"], questions: q({ answerPending: true }) }), LC, NOW);
    expect(d.action).toBe("unblock");
    expect(d.ops.some((o) => o.kind === "setOverlay" && o.overlay === "blocked" && !o.on)).toBe(true);
  });
  it("escalates a blocked card past its deadline (case 13)", () => {
    const d = decide(card({ stage: "design", overlays: ["blocked"], questions: q({ deadlinePassed: true }) }), LC, NOW);
    expect(d.action).toBe("escalate");
  });
  it("noops a blocked card with no answer and no deadline", () => {
    const d = decide(card({ stage: "design", overlays: ["blocked"], questions: q({}) }), LC, NOW);
    expect(d.action).toBe("noop");
  });
});
