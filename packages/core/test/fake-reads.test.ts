import { describe, it, expect } from "vitest";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";

describe("InMemoryBoardBackend reads", () => {
  it("listReady returns open, non-terminal candidates and readCard returns the full card", async () => {
    const b = new InMemoryBoardBackend(["spec", "dev", "test", "done"], ["done"]);
    b.seed(makeCanonicalCard({ id: "a", stage: "spec" }));
    b.seed(makeCanonicalCard({ id: "b", stage: "done" })); // terminal → excluded
    b.seed(makeCanonicalCard({ id: "c", stage: "dev", overlays: ["escalated"] }));

    const ready = await b.listReady({ excludeOverlays: ["escalated"] });
    expect(ready.map((r) => r.id).sort()).toEqual(["a"]);

    const card = await b.readCard({ id: "a", stage: "spec", type: "story" });
    expect(card.id).toBe("a");
    expect(b.capabilities.fencing).toBe("orchestrator");
  });
});
