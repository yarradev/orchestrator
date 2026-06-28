import { describe, it, expect } from "vitest";
import { loadTeamPolicy } from "../src/config.js";

describe("loadTeamPolicy (P2a)", () => {
  it("maps the advisor policy snake_case → camelCase", () => {
    const tp = loadTeamPolicy({
      advisors: [{
        role: "security-advisor", model: "sonnet", authority: "veto",
        joins_at: ["development"], watch_paths: ["**/payments/**", "**/.env*"],
        clear_authority: ["@human", "@counsel"],
      }],
    });
    expect(tp.advisors).toHaveLength(1);
    expect(tp.advisors[0]).toEqual({
      role: "security-advisor", authority: "veto",
      joinsAt: ["development"], watchPaths: ["**/payments/**", "**/.env*"],
      clearAuthority: ["@human", "@counsel"],
    });
  });

  it("defaults to no advisors when absent/undefined/empty", () => {
    expect(loadTeamPolicy(undefined)).toEqual({ advisors: [] });
    expect(loadTeamPolicy({})).toEqual({ advisors: [] });
    expect(loadTeamPolicy({ advisors: [] })).toEqual({ advisors: [] });
  });
});
