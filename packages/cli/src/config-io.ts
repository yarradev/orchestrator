import { readFileSync } from "node:fs";
import { loadLifecycle, loadTeamPolicy } from "@yarradev/core";
import type { LifecycleConfig, TeamPolicy } from "@yarradev/core";

export interface Configs { lc: LifecycleConfig; policy: TeamPolicy; }

export function loadConfigs(
  env: Record<string, string | undefined>,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
): Configs {
  const lcPath = env.YD_LIFECYCLE ?? "config/lifecycle.json";
  const polPath = env.YD_TEAM_POLICY ?? "config/team-policy.json";
  const lc = loadLifecycle(JSON.parse(read(lcPath)));
  let policy: TeamPolicy = { advisors: [] };
  try { policy = loadTeamPolicy(JSON.parse(read(polPath))); } catch { /* team-policy is optional */ }
  return { lc, policy };
}
