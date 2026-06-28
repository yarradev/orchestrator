import { describe, it, expect } from "vitest";
import { makeCanonicalCard } from "../src/card.js";

describe("makeCanonicalCard", () => {
  it("fills safe defaults around the required id", () => {
    const c = makeCanonicalCard({ id: "card-1" });
    expect(c.id).toBe("card-1");
    expect(c.type).toBe("story");
    expect(c.state).toBe("open");
    expect(c.overlays).toEqual([]);
    expect(c.lease).toBeNull();
    expect(c.checks.ci).toBe("absent");
    expect(c.counters).toEqual({ transitions: 0, bounces: {} });
  });

  it("preserves provided fields", () => {
    const c = makeCanonicalCard({ id: "card-2", stage: "dev", overlays: ["agent-running"] });
    expect(c.stage).toBe("dev");
    expect(c.overlays).toContain("agent-running");
  });
});
