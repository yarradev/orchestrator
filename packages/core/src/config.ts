// Typed lifecycle + team-policy config for the orchestrator core.
// `loadLifecycle` parses the v1 `lifecycle.mvp.json` schema (snake_case, the GitHub baseline — §2.3)
// into the camelCase shapes the decision engine (P2b) consumes. Pure: no I/O, no env. Callers read
// the JSON file and hand the parsed object in.

export type Gate = "judgement" | "mechanical" | "human" | "barrier";

export interface StageDef {
  ownerRole?: string;
  gate?: Gate;
  advanceOn?: string; // for mechanical stages: a CanonicalCard.checks key ("ci" | "tests" | "staging")
  next?: string;
  terminal?: boolean;
}

export interface Budgets {
  transitionBudget: number;
  bounceLimit: number;
  respawnLimit: number; // count-based bound on mechanical CI-failure respawns (backend-agnostic)
}

export interface LeaseConfig {
  ttlSeconds: number;
  skewGuardSeconds: number;
}

export interface LifecycleConfig {
  entryStage: string;
  stages: Record<string, StageDef>;
  epicEntryStage?: string;
  epicStages?: Record<string, StageDef>;
  backwardEdges: Record<string, { from: string; to: string }>;
  budgets: Budgets;
  lease: LeaseConfig;
}

const DEFAULT_RESPAWN_LIMIT = 3;
// Normalize legacy advance_on tokens to the canonical checks key. Unknown values pass through
// (judgement markers like "plan_posted" are vestigial under §5 — the verdict drives judgement stages).
const CHECK_SYNONYMS: Record<string, string> = { ci_green: "ci", tests_green: "tests" };

const finiteOr = (v: unknown, fallback: number): number => {
  if (v == null) return fallback; // Number(null) === 0 (finite) would otherwise mean "escalate everything"
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (v == null || typeof v !== "object" || Array.isArray(v)) throw new Error(`loadLifecycle: ${where} must be an object`);
  return v as Record<string, unknown>;
}

function mapStage(raw: unknown): StageDef {
  const s = asRecord(raw, "stage");
  const out: StageDef = {};
  if (typeof s.owner_role === "string") out.ownerRole = s.owner_role;
  if (typeof s.gate === "string") out.gate = s.gate as Gate;
  if (typeof s.advance_on === "string") out.advanceOn = CHECK_SYNONYMS[s.advance_on] ?? s.advance_on;
  if (typeof s.next === "string") out.next = s.next;
  if (s.terminal === true) out.terminal = true;
  return out;
}

function mapStages(raw: Record<string, unknown>): Record<string, StageDef> {
  const out: Record<string, StageDef> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = mapStage(v);
  return out;
}

export function loadLifecycle(json: unknown): LifecycleConfig {
  const j = asRecord(json, "config");
  if (typeof j.entry_stage !== "string") throw new Error("loadLifecycle: missing entry_stage");
  if (j.stages == null) throw new Error("loadLifecycle: missing stages");
  const budgetsRaw = asRecord(j.budgets ?? {}, "budgets");
  const leaseRaw = asRecord(j.lease ?? {}, "lease");

  const cfg: LifecycleConfig = {
    entryStage: j.entry_stage,
    stages: mapStages(asRecord(j.stages, "stages")),
    backwardEdges: {},
    budgets: {
      transitionBudget: finiteOr(budgetsRaw.transition_budget, 50),
      bounceLimit: finiteOr(budgetsRaw.bounce_limit, 3),
      respawnLimit: finiteOr(budgetsRaw.respawn_limit, DEFAULT_RESPAWN_LIMIT),
    },
    lease: {
      ttlSeconds: finiteOr(leaseRaw.ttl_seconds, 1800),
      skewGuardSeconds: finiteOr(leaseRaw.skew_guard_seconds, 0),
    },
  };

  if (typeof j.epic_entry_stage === "string") cfg.epicEntryStage = j.epic_entry_stage;
  if (j.epic_stages != null) cfg.epicStages = mapStages(asRecord(j.epic_stages, "epic_stages"));

  const edges = asRecord(j.backward_edges ?? {}, "backward_edges");
  for (const [k, v] of Object.entries(edges)) {
    const e = asRecord(v, `backward_edges.${k}`);
    cfg.backwardEdges[k] = { from: String(e.from), to: String(e.to) };
  }

  validateDispatchable(cfg.stages, "stages");
  if (cfg.epicStages) validateDispatchable(cfg.epicStages, "epic_stages");

  return cfg;
}

function validateDispatchable(stages: Record<string, StageDef>, where: string): void {
  for (const [k, st] of Object.entries(stages)) {
    if (st.terminal || st.gate === "barrier" || st.gate === "human") continue;
    if (!st.ownerRole) throw new Error(`loadLifecycle: ${where} stage '${k}' (gate:${st.gate ?? "judgement"}) needs owner_role — dispatchable stages must name an owner`);
  }
}

export interface AdvisorPolicy {
  role: string;
  authority?: "veto" | "advice";
  joinsAt: string[];
  watchPaths: string[];
  clearAuthority?: string[];
}

export interface TeamPolicy {
  advisors: AdvisorPolicy[];
}

export function loadTeamPolicy(json: unknown): TeamPolicy {
  if (json == null || typeof json !== "object") return { advisors: [] };
  const raw = (json as Record<string, unknown>).advisors;
  if (!Array.isArray(raw)) return { advisors: [] };
  const advisors: AdvisorPolicy[] = raw.map((a) => {
    const r = a as Record<string, unknown>;
    const out: AdvisorPolicy = {
      role: String(r.role),
      joinsAt: Array.isArray(r.joins_at) ? r.joins_at.map(String) : [],
      watchPaths: Array.isArray(r.watch_paths) ? r.watch_paths.map(String) : [],
    };
    if (r.authority === "veto" || r.authority === "advice") out.authority = r.authority;
    if (Array.isArray(r.clear_authority)) out.clearAuthority = r.clear_authority.map(String);
    return out;
  });
  return { advisors };
}

// The advisor watch-paths gate runs ONLY on the mechanical success leg (decide()). An advisor whose
// joins_at stages are all non-mechanical never fires — surface that as a startup warning (the CLI prints it).
export function inertAdvisorWarnings(lc: LifecycleConfig, policy: TeamPolicy): string[] {
  const isMechanical = (s: string): boolean => lc.stages[s]?.gate === "mechanical" || lc.epicStages?.[s]?.gate === "mechanical";
  const warns: string[] = [];
  for (const adv of policy.advisors) {
    if (!adv.joinsAt.some(isMechanical)) {
      warns.push(`advisor '${adv.role}' joins_at [${adv.joinsAt.join(", ")}] but none of those stages is mechanical — the advisor gate runs only on the mechanical success leg, so this advisor is inert.`);
    }
  }
  return warns;
}
