import { describe, it, expect } from "vitest";
import { loadLifecycle, loadTeamPolicy, inertAdvisorWarnings } from "../src/config.js";
import { RAW_LIFECYCLE, LC } from "./fixtures/lifecycle.js";

describe("loadLifecycle owner_role validation (#6)", () => {
  it("accepts the canonical fixture (every dispatchable stage names an owner)", () => {
    expect(() => loadLifecycle(RAW_LIFECYCLE)).not.toThrow();
  });
  it("throws when a judgement/mechanical stage omits owner_role", () => {
    const bad = { ...RAW_LIFECYCLE, stages: { ...RAW_LIFECYCLE.stages, development: { gate: "mechanical", advance_on: "ci_green", next: "testing" } } };
    expect(() => loadLifecycle(bad)).toThrow(/development.*owner_role/);
  });
  it("exempts terminal + barrier stages", () => {
    // RAW_LIFECYCLE.epic_stages.integrating is a barrier with no owner_role; done is terminal
    expect(() => loadLifecycle(RAW_LIFECYCLE)).not.toThrow();
  });
});

describe("inertAdvisorWarnings", () => {
  it("warns when an advisor joins only non-mechanical stages", () => {
    const policy = loadTeamPolicy({ advisors: [{ role: "security", joins_at: ["design"], watch_paths: ["**/*"] }] });
    const warns = inertAdvisorWarnings(LC, policy);   // design is a judgement stage
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/security/);
  });
  it("is silent when an advisor joins a mechanical stage", () => {
    const policy = loadTeamPolicy({ advisors: [{ role: "security", joins_at: ["development"], watch_paths: ["**/*"] }] });
    expect(inertAdvisorWarnings(LC, policy)).toEqual([]);   // development is mechanical
  });
});
