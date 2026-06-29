import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import type { Lease } from "../src/types.js";
import { LC, NOW, card } from "./fixtures/lifecycle.js";

const lease = (o: Partial<Lease>) => ({ epoch: 1, holder: "orch", role: "designer", expiresAt: NOW + 100_000, ...o });

describe("decide lease held (P2b-1 T8)", () => {
  it("noops while a valid lease is held (case 2)", () => {
    const d = decide(card({ stage: "design", epoch: 1, lease: lease({}), overlays: ["agent-running"] }), LC, NOW);
    expect(d.action).toBe("noop");
    expect(d.reason).toMatch(/valid lease|awaiting/);
  });
  it("reclaims an expired lease with the CURRENT stage owner, bumping epoch (cases 3,19)", () => {
    // stage is development → owner developer, even though the stale lease.role is designer
    // expiresAt must be > skewGuard (120s = 120_000 ms) past NOW to trigger leaseExpired
    const c = card({ stage: "development", epoch: 1, lease: lease({ role: "designer", expiresAt: NOW - 300_000 }) });
    const d = decide(c, LC, NOW);
    expect(d.action).toBe("reclaim");
    expect(d.dispatch).toMatchObject({ role: "developer", epoch: 2 });
    expect(d.ops.some((o) => o.kind === "claim" && o.role === "developer" && o.epoch === 2)).toBe(true);
  });
});
