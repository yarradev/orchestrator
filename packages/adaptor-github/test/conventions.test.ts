import { describe, it, expect } from "vitest";
import {
  stageLabel, parseStage, typeLabel, parseType, OVERLAY_LABELS, parseOverlays,
  idMarker, parseId, parseLease, setLease, noteMarker, hasNote,
} from "../src/conventions.js";
import type { Lease } from "@yarradev/core";

describe("conventions", () => {
  it("stage/type/overlay labels round-trip", () => {
    expect(stageLabel("dev")).toBe("stage:dev");
    expect(typeLabel("story")).toBe("type:story");
    expect(parseStage(["type:story", "stage:dev"])).toBe("dev");
    expect(parseStage(["type:story"])).toBeNull();
    expect(parseType(["type:epic"])).toBe("epic");
    expect(parseType([])).toBe("story");
    expect(OVERLAY_LABELS["escalated"]).toBe("yd:escalated");
    expect(parseOverlays(["stage:dev", "yd:escalated", "yd:blocked"]).sort()).toEqual(["blocked", "escalated"]);
  });

  it("id marker round-trips and is found in a larger body", () => {
    const body = `Some intent text\n${idMarker("card-1")}`;
    expect(parseId(body)).toBe("card-1");
    expect(parseId("no marker here")).toBeNull();
  });

  it("lease set/parse round-trips and removal strips the marker", () => {
    const lease: Lease = { epoch: 3, holder: "orch", role: "developer", expiresAt: 1234 };
    const withLease = setLease("intent", lease);
    expect(parseLease(withLease)).toEqual(lease);
    const cleared = setLease(withLease, null);
    expect(parseLease(cleared)).toBeNull();
    expect(cleared).toContain("intent");
  });

  it("setLease replaces an existing lease (no duplicate markers)", () => {
    const a = setLease("x", { epoch: 1, holder: "o", role: "r", expiresAt: 1 });
    const b = setLease(a, { epoch: 2, holder: "o", role: "r", expiresAt: 2 });
    expect(parseLease(b)!.epoch).toBe(2);
    expect(b.match(/yd:lease=/g)!.length).toBe(1);
  });

  it("note marker dedup detection", () => {
    expect(noteMarker("k1")).toBe("<!--yd:note=k1-->");
    expect(hasNote([`${noteMarker("k1")}\nbody`], "k1")).toBe(true);
    expect(hasNote(["unrelated"], "k1")).toBe(false);
  });
});
