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
      transitionBudget: Number(budgetsRaw.transition_budget ?? 0),
      bounceLimit: Number(budgetsRaw.bounce_limit ?? 0),
      respawnLimit: Number(budgetsRaw.respawn_limit ?? DEFAULT_RESPAWN_LIMIT),
    },
    lease: {
      ttlSeconds: Number(leaseRaw.ttl_seconds ?? 1800),
      skewGuardSeconds: Number(leaseRaw.skew_guard_seconds ?? 0),
    },
  };

  if (typeof j.epic_entry_stage === "string") cfg.epicEntryStage = j.epic_entry_stage;
  if (j.epic_stages != null) cfg.epicStages = mapStages(asRecord(j.epic_stages, "epic_stages"));

  const edges = asRecord(j.backward_edges ?? {}, "backward_edges");
  for (const [k, v] of Object.entries(edges)) {
    const e = asRecord(v, `backward_edges.${k}`);
    cfg.backwardEdges[k] = { from: String(e.from), to: String(e.to) };
  }
  return cfg;
}
