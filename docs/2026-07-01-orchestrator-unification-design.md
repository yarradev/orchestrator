# Orchestrator Unification — Design

**Date:** 2026-07-01 · **Status:** design (approved in brainstorm 2026-07-01) · **Spec location note:** kept in `orchestrator/docs/` alongside its inputs (`2026-07-01-runtime-convergence-gap-analysis.md`, `2026-07-01-v1-parity.md`) rather than the skill-default `docs/superpowers/specs/`, matching this repo's flat-`docs/` convention.

**Inputs (read first):** the runtime-convergence gap analysis and the v1 parity spec (same dir). This spec turns those into a buildable target.

---

## 1. Problem & goal

One conceptual thing — "an orchestrator drives a governed board through a gated lifecycle by dispatching role agents" — fractured into **four** artifacts (v1 `yarrasys/yarradev`, the `orchestrator` TS repo, the `yarradev-board` plugin, the `platform/orchestrator/` stub) plus a full Cloudflare platform, with three drifting `decide()`s and a security gate that silently passes.

**Goal:** collapse to **one orchestrator = the `yarradev-board` plugin**, driving **one smart Cloudflare board**, with a single **typed `orchestrator-core`** as the brain — reproducing the *proven* behavior of v1 (battle-tested in yanyja), on the platform's stronger substrate.

**Confirmed product decisions (brainstorm):**
- **Drop GitHub Issues entirely.** Single Cloudflare backend. Free tier is a Cloudflare board *capability tier* (separate spec), not a backend swap.
- **Plugin is the sole runtime**, on the user's compute + their LLM subscription (keyless). The board never makes model calls.
- **Behavioral parity, board owns server-enforced gates.** The core routes; the board disposes; subagents propose.
- **Typed `orchestrator-core`** (TS + tests) **bundled** (vendored `.mjs`) into the plugin — self-contained, no runtime npm dep.

**Confirmed design decisions (A–E):**
- **A. Advisor enforcement** — interim: `advisor_clear` requires a review to *exist* at the advisor stage (closes the P0 now); then content-scanner + watch_paths gating once the webhook carries changed files.
- **B. Respawn backstop** — count respawn CLAIMs toward the transition budget (v1's proven backstop) + keep a time-window; delete the dead count-based `respawnLimit`.
- **C. Epic/analyst tier** — include now (wire the existing fan-in primitive + add `analyst`). Cross-board/multi-repo federation deferred.
- **D. thread_budget** — deferred (never exercised in v1 or yanyja); tracked.
- **E. Risk tier R0–R4** — shadow now (advisory), gate later.

---

## 2. Target architecture

```
┌ yarradev-board plugin (Claude Code) — the ONLY runtime, keyless ────────────┐
│  SKILL.md conductor loop — lists ready cards, routes, dispatches, yields     │
│  orchestrator-core  (authored TS · bundled → vendored .mjs)                  │
│     decide(card, lifecycle, budgets, policy) → Action   (8-branch, det.)     │
│     reduce(verdict, card, lifecycle) → Act[]            (verdict → acts)     │
│     boardClient                                          (one typed client)  │
│  role subagents via Agent tool (user's LLM sub):                             │
│     analyst · designer · developer · tester · security-advisor · releaser    │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ HTTPS acts + reads (per-role bearer)
                ▼
      Cloudflare board (platform: yarradev-api → BoardDO) — the smart backend
        enforces gates server-side (ci_green, tests_green, no_open_veto/hold,
        advisor_clear, human_go, fan-in, within_budget) · leases/gen-fence ·
        content scanners · audit · cockpit · MCP · webhook CI ingest
        free/paid = board capability tiers (separate spec)

DELETED: BoardBackend seam · adaptor-github · adaptor-board · YD_BACKEND factory ·
         CanonicalCard neutral model · lib.mjs (plugin's parallel client) ·
         platform/orchestrator/ stub → examples/board-smoke contract test
```

**Data model:** the core uses the board's native **`EnrichedItem`** (from the board client's types) directly — no neutral `CanonicalCard`, no mapping layer (that mapping *was* the broken `conventions.ts`). One backend ⇒ the board's protocol is the model.

**Three-decide collapse:** `orchestrator-core/decide.ts` is the single source; the plugin's `decide.mjs` is **generated/bundled from it**, not hand-maintained; `platform/orchestrator/src/decide.ts` is retired.

---

## 3. Components

### 3.1 `orchestrator-core` (TS, slimmed from the `orchestrator` repo)
- **`decide()`** — the deterministic precedence function (ported from v1 `eval-gates.js` `_decide` + current core, single-backend): malformed→escalate · budget/bounce→escalate · **board-drift→escalate** · blocked(answer-pending/deadline/park) · veto-held park/clear · **epic fan-in barrier** (0-children escalate / all-done advance / else noop) · terminal-act-at-gen · **mechanical gate** (success→advisor→advance · pending/absent→noop · failure→respawn-bounded) · lease-expired→reclaim · else spawn. Adds `promote` (human gate) — backported so core is a true superset.
- **`reduce()`** — verdict → acts (advance→MOVE, reject→REJECT on a defined edge, submitted→LINK_PR/PUSH, question→ASK, advisor veto/hold/advice/clean → VETO/HOLD/NOTE + **persisted reviewed-head record**).
- **`boardClient`** — one typed HTTP client (union of what `lib.mjs` + `@yarradev/board-client` cover: list/getEnriched/config, acts, batch, claim/move/reject/link-pr/push/veto/hold/clear/clear-veto/ask/answer/human-go/escalate/**clear-hold**).
- **Deleted:** `backend.ts` seam, both adaptors, factory, `CanonicalCard`.
- **Build:** `tsc` → bundle to a vendored `.mjs` the plugin ships (self-contained; zero runtime dep).

### 3.2 The plugin (`yarradev-board`)
- **Conductor** (`SKILL.md`): lists ready cards (exclude escalated), calls bundled `decide`, executes the dispatch, calls `reduce`→posts acts. No LLM reasoning in the routing path.
- **Role subagents** (`agents/*.md`): analyst (new), designer, developer, tester, security-advisor, releaser (+ optional legal-advisor). **P0-7: templates derive `from-stage` from the card's live stage, never a literal.**
- **P0-5:** developer agent links PRs with non-closing `Refs #N`.
- Naming: keep `yarradev-board` for now; the `yarradev` name is freed (orchestrator repo absorbed) — rename is an optional follow-up, out of this spec.

### 3.3 The board (platform) — parity additions
- **Advisor (A):** `advisor_clear` requires a *reviewed record* at the advisor stage (interim); persist ADVICE/clean reviews so `headFresh()` has data; then content **scanners** (port `checks/run-scanners.js` + `scanners.json`, admin/CODEOWNERS-protected) + watch_paths matching once the webhook carries changed files.
- **Named check (P0-2):** `tests_green` wired on `test→done`; `tests_green.check`/`ci_green` resolved against an **admin-owned allowlist** of trusted check names (fail-closed on absent).
- **Rework-staleness (P0-3):** on REJECT (and CLAIM gen-bump), gen-scope/reset `ci_rollup`/`linked_head_sha` so a mechanical gate can't fire on pre-reject output (mirror the existing `review_approved` head-freshness).
- **Respawn backstop (B):** count respawn CLAIMs toward `within_budget{transitions}`; delete dead `respawnLimit`.
- **Config drift (P1-7):** wire the existing `config_hash` into a CI check diffing committed `scripts/configs/*.json` vs the live board; single-source the plugin/core lifecycle from `GET /config` (or a startup coherence check).
- **Naming crosswalk:** document target `CLEAR`=v1 `ACK` (HOLD), `CLEAR_VETO`=v1 `CLEAR` (VETO).

---

## 4. Behavioral requirements → where they land

| Req | Owner | Notes |
|---|---|---|
| **P0-1** advisor dispatch + non-vacuous `advisor_clear` | board (gate+scanners) · core (dispatch decision) · plugin (deterministic match) | A: interim-now, scanner-gated next |
| **P0-2** named staging/tests check, fail-closed | board (config + allowlist) | |
| **P0-3** rework-staleness | board (fold) | + core `decide` respects it |
| **P0-4** releaser owns staging+prod | plugin (agent) + config (caps/edges) | never autonomous prod merge |
| **P0-5** non-closing `Refs #N`, engine closes once | plugin (dev agent) + board | |
| **P0-6** stale-epoch acts never reprocessed | board (fence) | add regression test (yanyja `#281`) |
| **P0-7** derive stage, no hardcoded literals | plugin (agents) | |
| **P1** typed grammar, epoch/sha echo, 3-verdict ladder, re-review-supersedes-VETO, board-drift, respawn-on-budget, epic+analyst+fan-in, fast-lane, single-source config, content scanners, bulk reconcile | core + board + plugin | port from v1, ranked by yanyja evidence |
| **P2 (defer, tracked)** QUESTION/ANSWER + thread_budget · risk-gate enforcement · auto-ESCALATE gate weight · cross-board federation · free/paid tiering · constitution compiler | — | shadow risk now; rest deferred with rationale |

---

## 5. Data flow (one tick)
list ready (exclude escalated) → for each card: `decide(EnrichedItem)` → if spawn/respawn: CLAIM (bumps gen, counts to budget) + dispatch role subagent (Agent tool) → parse verdict → `reduce()` → post act(s) → board enforces gate (403/409/422 or commit) → yield. Board owns fencing, gates, scanners, audit; core owns routing; subagents own the work.

## 6. Repo / naming outcome
Collapse **8 yarradev repos → 3**: `yarradev/platform` (backend), `yarradev/yarradev-board` (the one orchestrator; absorbs `orchestrator-core`), `yarradev/public-claude-plugins` (marketplace). **Archive** the 4 `yarrasys/*` leftovers (incl. v1 `yarrasys/yarradev`) and — after absorbing core — `yarradev/orchestrator`. Retire `platform/orchestrator/` → `platform/examples/board-smoke` contract test. Update the LikeC4 `runner` model to point at the plugin (URL links, CI-safe).

## 7. Migration / sequencing
- **Phase 0 — P0 (correctness/security), on the current split codebase** so prod stops being wrong ASAP: advisor non-vacuous + dispatch, tests_green + allowlist, rework-staleness, releaser, non-closing Refs, stale-epoch regression test, derive-stage.
- **Phase 1 — unify code:** extract `orchestrator-core` (single backend, delete adaptors/CanonicalCard), bundle → plugin, retire the stub, generate `decide.mjs` from core, single-source config.
- **Phase 2 — port P1 policy:** board-drift, respawn backstop, ADVICE persistence + head-fresh re-review, content scanners, epic+analyst tier + fan-in wiring, fast-lane, first-class bulk reconcile.
- **Phase 3 — repo/naming cleanup:** archive leftovers, collapse to 3, optional `yarradev` rename, LikeC4 runner remodel.
- **Deferred:** P2 set above.

## 8. Testing
- **Port v1's `cases.json` (60+ decision fixtures)** as `orchestrator-core`'s test corpus — the proven behavioral oracle.
- **New P0 regression tests (TDD, write first):** rework-staleness (REJECT→no stale re-advance), stale-epoch REJECT ignored (yanyja `#281`), advisor fail-open (watched-path PR blocks w/o review), tests_green enforced, unknown-stage/malformed escalate.
- Keep all existing suites green (board/api/shared/dashboard/mcp/webhook) + the plugin's `node:test` suite; bundled core ships with its TS tests.

## 9. Error handling / edge cases (from yanyja)
Board-drift → ESCALATE (live on `#284-286`) · phantom lease when a role agent is missing → releaser must exist · manual bulk reconcile must re-sync the in-body pin · lease reclaim is passive in a session runtime → rely on the board's proactive `alarm()` (target ahead) · no-cheapest-model-on-veto CI guard generalized across advisors (yanyja's `legal-advisor: haiku` slipped through).

## 10. Out of scope (explicit)
Free/paid tiering · cross-board/multi-repo federation (yanyja was GitHub-multi-repo; single Cloudflare board now) · the constitution→`yarradev-compile` chain (never built in v1; target's `compile()` already exceeds it) · GitHub Issues backend (dropped) · a hosted server-side runner (keyless plugin only).

## 11. Risks
- Bundling core→plugin adds a build step; mitigate with a CI check that the vendored `.mjs` matches `tsc` output.
- Porting scanners server-side needs the webhook to carry changed files — sequenced (interim always-run first).
- Generating `decide.mjs` from core must stay lockstep — CI guard.
