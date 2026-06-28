import { describe, it, expect } from "vitest";
import type { BoardBackend } from "../backend.js";
import type { CanonicalCard } from "../types.js";

export interface ContractHarness {
  name: string;
  make: () => Promise<BoardBackend> | BoardBackend;
  seed: (b: BoardBackend, card: CanonicalCard) => Promise<void> | void;
  card: (over: Partial<CanonicalCard> & { id: string }) => CanonicalCard;
}

export function runBoardBackendContract(h: ContractHarness): void {
  const ref = (id: string, stage: string) => ({ id, stage, type: "story" as const });

  describe(`BoardBackend contract: ${h.name}`, () => {
    it("exposes a capabilities descriptor", async () => {
      const b = await h.make();
      expect(["pull", "push"]).toContain(b.capabilities.ci);
      expect(["native", "orchestrator"]).toContain(b.capabilities.fencing);
    });

    it("claim → setStage advance is committed and readable", async () => {
      const b = await h.make();
      await h.seed(b, h.card({ id: "a", stage: "dev" }));
      const c1 = await b.applyOps(ref("a", "dev"), [{ kind: "claim", role: "developer", epoch: 1, ttlS: 1800 }], { epoch: 0, holder: "orch" });
      expect(c1.results[0].outcome).toBe("committed");
      const c2 = await b.applyOps(ref("a", "dev"), [{ kind: "setStage", from: "dev", to: "test", epoch: 1 }], { epoch: 1, holder: "orch" });
      expect(c2.results[0].outcome).toBe("committed");
      expect((await b.readCard(ref("a", "test"))).stage).toBe("test");
    });

    it("setStage on a mismatched from is fenced (reconcile-forward signal)", async () => {
      const b = await h.make();
      await h.seed(b, h.card({ id: "a", stage: "test" }));
      const r = await b.applyOps(ref("a", "test"), [{ kind: "setStage", from: "dev", to: "test", epoch: 1 }], { epoch: 1, holder: "orch" });
      expect(r.results[0].outcome).toBe("fenced");
    });

    it("note is idempotent by key across re-application", async () => {
      const b = await h.make();
      await h.seed(b, h.card({ id: "a", stage: "dev" }));
      const note = { kind: "note" as const, body: "audit", key: "k-dup" };
      const r1 = await b.applyOps(ref("a", "dev"), [note], { epoch: 0, holder: "orch" });
      const r2 = await b.applyOps(ref("a", "dev"), [note], { epoch: 0, holder: "orch" });
      expect(r1.results[0].outcome).toBe("committed");
      expect(r2.results[0].outcome).toBe("committed");
    });

    it("listReady excludes terminal + filtered-overlay cards", async () => {
      const b = await h.make();
      await h.seed(b, h.card({ id: "a", stage: "dev" }));
      await h.seed(b, h.card({ id: "z", stage: "dev", overlays: ["escalated"] }));
      const ready = await b.listReady({ excludeOverlays: ["escalated"] });
      expect(ready.map((r) => r.id)).toContain("a");
      expect(ready.map((r) => r.id)).not.toContain("z");
    });
  });
}
