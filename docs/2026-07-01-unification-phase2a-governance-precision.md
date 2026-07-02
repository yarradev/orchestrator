# Unification Phase 2a — Governance Precision (port v1's proven advisor/budget policy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. TDD throughout — failing test first, minimal impl, green, commit. Checkbox (`- [ ]`) steps. Obey the MASTER runbook Autonomy Contract (§1). §0 decisions are RESOLVED — execute directly.
>
> **REVISION NOTE (2026-07-02, post plan-review):** an adversarial review flagged the original T3+T4 (board-side watch_paths matching over *developer-reported* changed-files) as a **security trust downgrade** that re-introduces P0-1 (a prompt-injectable developer agent could under-report changed files to dodge the veto-authority advisor). Those tasks are **removed from 2a and deferred to 2b**, gated on an *authenticated* changed-files source. Crucially, the security-advisor **already self-diffs authoritatively** (`agents/security-advisor.md:24-30`), so per-PR precision already exists — Task 1 (post the clean verdict so the gate clears) is what actually delivers the P0-1 win. See §0-D2.

**Goal:** Close the governance holes that bit yanyja in practice — make `advisor_clear` actually clear (auto-post the advisor's clean review so a clean card stops re-dispatching forever), persist *why* an advisor vetoed/held, bound respawn loops by count, and stop config from silently lying — porting v1's proven advisor + budget policy onto the platform's substrate, **without** weakening the security gate's trust model.

**Architecture:** The board (Cloudflare) owns gate *enforcement*; `orchestrator-core` routes; the plugin conductor dispatches role subagents and posts acts. Phase 2a is a thin **plugin conductor** wiring fix (post ADVICE at every advisor-dispatch path) + **board-side** persistence (advisor reason, respawn counting) + **budget/config hygiene** + **CI guards**. The security-advisor's existing self-diff is the trusted precision mechanism; the board is not given an untrusted file list.

**Tech stack:** TypeScript (strict, ESNext), vitest (board/shared/core), `node:test` (plugin), esbuild (vendored bundle), Cloudflare Workers/DO/D1, pnpm workspaces, GitHub Actions CI.

## Global constraints (apply to every task)
- **The board owns server-enforced gates; the plugin/core never bypass them.** Behavioral parity with v1's *proven* policy is the bar — port what bit in yanyja, not v1's unbuilt vision, and never weaken the security trust model to save a call.
- **Keyless:** the plugin/core never hold an LLM key or a GitHub App token (`workers/webhook/src/outbound.ts` stays sealed). A veto-authority security decision is NEVER sourced from a reviewee/prompt-injectable subagent.
- **Additive, guarded migrations only** (DO SQLite via `_migrations`); no destructive schema changes. Keep every existing suite green (board/api/shared/dashboard/mcp/webhook/orchestrator-core + plugin `node:test`) + `pnpm -r typecheck` + the vendored-bundle drift guard + LikeC4 drift-check.
- **One authoritative source per config concern** — budgets are currently multi-modeled + partly dead; 2a single-sources them.
- **Cite `path:line`; TDD, DRY, YAGNI, frequent commits.** Any core change ⇒ rebuild the vendored `.mjs` (`pnpm --filter @yarradev/orchestrator-core build`) + re-run `platform/scripts/check-vendored-core.sh`.
- **Cross-repo merge order (from Phase 1):** platform `core.yml` diffs the rebuilt bundle against the plugin's default branch → the **plugin PR merges before/with the platform PR**.

---

## 0. DECISIONS (RESOLVED)

- [x] **D1 — Phase 2 is SPLIT.** This plan = **Phase 2a: governance precision**. **Phase 2b (deferred, separate plan): epic/analyst two-tier + fan-in wiring + analyst role/persona, fast-lane entry, content scanners, AND board-side watch_paths narrowing (gated on an authenticated changed-files source).** See §Deferred.
- [x] **D2 — Advisor precision is ALREADY achieved by the advisor's self-diff; do NOT add board-side watch_paths matching in 2a.** The security-advisor runs its own `git diff --name-only origin/main...<branch>` + case-insensitive watch-path match and returns `clean` on no-match (`agents/security-advisor.md:24-30`). So dispatching the advisor and honoring its verdict already gives per-PR precision from a *trusted* source. The board does NOT need a changed-files list for correctness. **Board-side narrowing (skip the advisor call when files don't match) is a cost optimization, DEFERRED to 2b, and MUST be sourced from an *authenticated* file list** (unseal Phase-5 outbound GitHub `GET /pulls/{n}/files`, OR the lossy-but-authenticated `push` webhook `commits[].added/modified/removed` with fail-safe-on-truncation) — **never** from the developer/reviewee agent (a trust downgrade that re-introduces P0-1). *(Rejected: original D2 "developer reports changed_files".)*
- [x] **D3 — Content scanners DEFERRED to 2b** (same authenticated-source dependency as D2; v1 shipped them inert/"phase 6"). The advisor's self-diff is the interim precision; scanners are the OR-backstop added in 2b once an authenticated pipeline exists.
- [x] **D4 — Respawn backstop = COUNT respawn CLAIMs toward `transitions_count` + keep the time-window secondary.** v1 parity. `decide`'s leg-4 backstop already reads `transitions_count`; bumping it on a respawn CLAIM makes a stuck CI-fail loop escalate within budget. (See T3 Minor: the 60s `respawn_window_ms` often fires first — this is v1-parity defense-in-depth, not the primary bound.)

---

## Scope map (Phase 2a items → provenance)
| Task | Item | Provenance | Blast radius |
|---|---|---|---|
| 1 | Auto-post ADVICE at **every** advisor-dispatch path (fix the clean-card livelock) | P1-2; Phase-0 deferral | plugin + core (bundle) |
| 2 | Persist advisor `reason` (VETO/HOLD/ADVICE) | P1-2; Phase-1 follow-up | board + shared + core |
| 3 | Respawn backstop — count respawn CLAIMs (D4) | P1-4 | plugin + board |
| 4 | Dead-budget cleanup / single-source | gap-analysis; survey | shared + plugin config |
| 5 | CI guards: config_hash drift + dead-glob + no-cheap-model (plugin CI) | P1-7, P1-9 | platform + plugin CI |
| 6 | Fold Phase-1 follow-ups + board-drift parity confirm | Phase-1 review; P1-3 | core + tests + CI |

**Removed from 2a (→ 2b, D2/D3):** developer-reported changed_files pipeline; board-side watch_paths-precise `advisor_clear`; content scanners. Reason: security trust model (see D2) + no authenticated file source until Phase 5.

---

## Target file structure (touch map)
**platform/workers/board/src/** — `schema.ts` add `advisor_state.reason TEXT` (guarded) [T2]; `storage.ts` thread `reason` through `setAdvisorFlag`/`recordAdvice` + expose on the vetoes/holds projection [T2], CLAIM fold bumps `transitions_count` on `data.respawn` [T3].
**platform/packages/shared/src/** — `types.ts` `AdvisorFlag { role; reason? }` [T2]; `budgets.ts` single-source `transition_budget` [T4]. (`gates.ts`, `compile.ts` unchanged — advisor `required` stays `joins_at`-based; no watch_paths matching in 2a.)
**platform/packages/orchestrator-core/src/** — `boardClient.ts` add `advice(id, head, reason?)` [T1]; `reduce.ts` ADVICE carries `verdict.reason` [T1]; `decide.ts` unchanged (T6 only tightens a test).
**yarradev-board/skills/yarradev-board-run/** — `scripts/advice.mjs` (new) [T1]; `SKILL.md` add a **top-level advisor-verdict branch** (advice/clean → POST ADVICE; veto/hold → VETO/HOLD) covering BOTH the inline-after-submit dispatch AND the decide-dispatched primary advisor work item [T1]; `scripts/claim.mjs` accept `--respawn` [T3]; `scripts/vendor/core.mjs` rebuilt [T1].
**platform/scripts/ + .github/workflows/ + yarradev-board CI** — `check-config-hash.sh`, `check-watch-paths.sh` (new) + platform workflow step [T5]; no-cheap-model guard in the **plugin** CI (model lives in `agents/*.md` frontmatter) [T5]; a `child_process` coherence-wiring test [T6].

---

## Tasks

### Task 1: Auto-post ADVICE at every advisor-dispatch path — fix the clean-card livelock  *(the real bug; most urgent)*
**Why:** board+core ADVICE handling is already correct (`storage.ts:888-897` fold; gen-scoped head-fresh `advisor_clear` in `buildGateInputs`; non-vacuous `clear: !!asr && …` at `:404`). But the conductor never POSTs ADVICE (`SKILL.md:120` "advice/clean → log only"; no `advice.mjs`; no `boardClient.advice()`). So a clean `dev` card that's never vetoed has no `advisor_state` row → `advisor_clear` false forever → `decide` re-dispatches the advisor **every tick**.
**Two dispatch paths must both be handled** (plan-review Important): (a) the inline advisor dispatch after a developer `submitted` verdict (`SKILL.md:116`), and (b) `decide`'s engine leg dispatching the advisor as a **primary** work item (`decide.ts:103-106`, `kind:"work", role:"security-advisor"`). In path (b) the advisor returns `{status:"clean"|"veto"|"advice"|"hold"}`, which matches NONE of advance/reject/submitted/question in the SKILL top-level parser → "no parseable block → post nothing" → the livelock persists on the engine path. T1 must add a **top-level advisor-verdict branch** so an advisor verdict is honored wherever the advisor is dispatched.
**Files:** Modify `orchestrator-core/src/{boardClient.ts,reduce.ts}`; Create `yarradev-board/.../scripts/advice.mjs`; Modify `SKILL.md`; rebuild `vendor/core.mjs`. Tests: `boardClient.test.ts`, `reduce.test.ts`; plugin `test/`.
**Interface produced:** `BoardClient.advice(id, head, reason?): Promise<AppendResult>` → posts `{type:"ADVICE", item_id:id, data:{reviewed_head:head, reason}}` (gen-exempt).
- [ ] **Step 1 — failing tests (core):** `boardClient.test.ts` — `advice("c1","abc","ok")` posts `{type:"ADVICE",item_id:"c1",gen:null,data:{reviewed_head:"abc",reason:"ok"}}`. `reduce.test.ts` — `{status:"advice", head, reason}` → `[{type:"ADVICE", data:{reviewed_head:head, reason}}]` (currently drops `reason`, `reduce.ts:71`).
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** add `advice()` to `boardClient.ts` (mirror `veto()`/`hold()` `:204-210`); `reduce.ts:69-71` carry `reason: verdict.reason ?? ""`.
- [ ] **Step 4 — PASS** + typecheck; rebuild bundle + regen sha256 + `check-vendored-core.sh` GREEN.
- [ ] **Step 5 — plugin wiring:** create `advice.mjs` (`<id> <head> [reason...]` → `client.advice`); add a **top-level** advisor-verdict branch to `SKILL.md`'s verdict handling: advice/clean → `advice.mjs`, veto → `veto.mjs`, hold → `hold.mjs`, applied whenever the dispatched role is the advisor (both the inline-after-submit path and the decide-dispatched primary path). Plugin `node --test` green.
- [ ] **Step 6 — commit** both repos (`fix(governance): post ADVICE at every advisor-dispatch path — kill the clean-card advisor livelock`).
- [ ] **Acceptance:** a clean `dev` card, advisor dispatched via EITHER path, ends with an `advisor_state` clean row at the head → `advisor_clear` clears → advances; no re-dispatch next tick.

### Task 2: Persist advisor `reason` (VETO/HOLD/ADVICE)
**Why:** `reduce`/`boardClient` send `data.reason` for VETO/HOLD (`reduce.ts:66,68`) but `setAdvisorFlag` (`storage.ts:589-608`) never stores it — `advisor_state` has no `reason` column (`schema.ts:187-195`); reason survives only in the immutable act log. A human viewing a vetoed card sees no reason.
**Files:** `platform/workers/board/src/{schema.ts,storage.ts}`; `platform/packages/shared/src/types.ts`. Tests: `workers/board/test/`.
- [ ] **Step 1 — failing test:** a VETO `data:{reason:"touches auth without review", head}` → enriched `vetoes[]` entry carries `{role:"security-advisor", reason:"…"}`; ADVICE reason persists too.
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** guarded additive `reason TEXT` on `advisor_state` (`_migrations` pattern); thread a `reason` param through `setAdvisorFlag` (`:589-608`) + `recordAdvice` (`:621-632`); read it in the vetoes/holds projection (`storage.ts:1526-1531`); add `reason?: string` to `AdvisorFlag` (`types.ts:129-131`). **NB:** don't conflate `item.veto_held` vs `advisor_state.veto_open` (naming asymmetry).
- [ ] **Step 4 — PASS** + typecheck + full board suite. **Step 5 — commit** (`feat(governance): persist + surface advisor veto/hold/advice reason`).

### Task 3: Respawn backstop — count respawn CLAIMs toward the transition budget  *(D4)*
**Why:** respawn is bounded only by a 60s window (`decide.ts:109-115`); v1 counted every CLAIM. `transitions_count` bumps only on MOVE/REJECT (`storage.ts:788`); CLAIM never touches it.
**Files:** `yarradev-board/.../scripts/claim.mjs` + `SKILL.md`; `platform/workers/board/src/storage.ts`. Tests: `workers/board/test/`.
- [ ] **Step 1 — failing test:** a CLAIM `data.respawn===true` increments `item.transitions_count`; a normal CLAIM does not; after `transition_budget`(50) respawns, `decide` leg-4 (`:43-45`) returns `escalate "transition-budget"`.
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** `claim.mjs` accepts a `--respawn` flag → CLAIM with `data:{respawn:true,…}`; `SKILL.md` passes it when `kind==="respawn"` (already computed by `decide`). Board CLAIM fold (`storage.ts:949-979`): on `data.respawn`, add `transitions_count = transitions_count + 1` to the existing `UPDATE item …`. Keep the `respawn_window_ms` leg (no change). Optionally repurpose the dead `counterInc(id,"*")` (`:795`) for an observable respawn tally instead of bumping the shared counter — implementer's call; document which.
- [ ] **Step 4 — PASS** + typecheck. **Step 5 — commit** both repos (`feat(governance): count respawn CLAIMs toward transition budget (v1 parity)`).
- [ ] **Minor (verify reachability):** `parked_since_ts` is set on the dev MOVE and not reset by CLAIM, so with realistic (>60s) CI latency the `respawn_window_ms` escalate fires on the first failure before respawn CLAIMs accumulate — confirm the count path is reachable (e.g. fast-failing CI) or note it as defense-in-depth for the fast-loop case.

### Task 4: Dead-budget cleanup — single-source, stop the config-lie
**Why:** `transition_budget`/`respawn_window_ms` are dead in ≥3 places (`board.json:21` never read; `acme-main-v2.json:87` `transition_budget` consumed by no gate; only live value = `decide`'s `DEFAULT_BUDGETS`). TWO **structurally different** `DEFAULT_BUDGETS` (`orchestrator-core/config.ts:20-23` = {transition_budget, respawn_window_ms} vs `shared/budgets.ts:16-19` = {transition_budget, bounce_limit}); they overlap only on `transition_budget:50`.
**Files:** `packages/shared/src/budgets.ts` + `orchestrator-core/src/config.ts`; `yarradev-board/.../config/board.json`; `storage.ts:795`.
- [ ] **Step 1 — single-source + document:** the live transition-budget enforcement is `decide`'s client-side `DEFAULT_BUDGETS.transition_budget` (there is NO `within_budget{transitions}` gate in `acme-main-v2.json` — only `{bounces}` on the 3 REJECT edges + the hardcoded REJECT backstop `storage.ts:1943-1948`, which reads `loadBudgets()`/`budgets_json`). Action: strike the inert `transition_budget`/`respawn_window_ms` from `board.json` (or mark `_note: advisory`); share the ONE overlapping `transition_budget:50` constant across the two `DEFAULT_BUDGETS` and **document** why the rest differ (do NOT naively merge — different shapes; `decide` deliberately takes no budgets arg). Remove the dead `counterInc(id,"*")` unless T3 repurposed it.
- [ ] **Step 2 — tests green** (hygiene, no behavior change). **Step 3 — commit** (`refactor(governance): single-source transition_budget; remove dead budget copies`).

### Task 5: CI guards — config_hash drift + dead-glob + no-cheapest-model-on-veto
**Why:** v1 specced but never built a config-drift check (P1-7); watch_paths need a static coverage check; the no-cheap-model-on-veto guard (yanyja's `legal-advisor: haiku` slipped) should generalize.
**Files:** `platform/scripts/check-config-hash.sh`, `platform/scripts/check-watch-paths.sh` (new) + a platform workflow; the no-cheap-model guard in the **plugin** CI (advisor `model`/`authority` live in `yarradev-board/agents/*.md` frontmatter — `security-advisor.md:5,9` — NOT in `acme-main-v2.json`; platform CI can't see the plugin, so this guard runs in the plugin repo's CI, or platform CI checks out the plugin). Tests: RED-on-seeded-drift (TDD like the vendored-core guard).
- [ ] **Step 1 — failing checks:** `check-config-hash.sh` compiles committed `scripts/configs/acme-main-v2.json` (via `compile()`) and diffs the machine/hash vs a committed snapshot (or opt-in live `GET /config`) — fails on drift. `check-watch-paths.sh` asserts every advisor `watch_paths` glob is well-formed + non-empty. Plugin-CI guard: no `authority: veto` advisor is configured to a cheapest-tier model.
- [ ] **Step 2 — FAIL (seeded)** → **Step 3 — implement** + wire into CI (fail closed) — config-hash + dead-glob in platform CI, no-cheap-model in plugin CI. **Step 4 — PASS. Step 5 — commit** both repos (`ci(governance): config_hash drift + dead-glob + no-cheap-model-on-veto guards`).

### Task 6: Fold Phase-1 follow-ups + board-drift parity confirm
**Files:** `orchestrator-core/test/decide.test.ts`; a `child_process` test for `list-ready.mjs`; `boardClient.ts`/`list-ready.mjs` (getJson status); `reduce.ts:47` (backward-edge); a board-drift parity test.
- [ ] **Board-drift (mostly done — do NOT re-port v1's veto-drift):** confirm `decide.ts:58` (blocked-drift) matches v1 `eval-gates.js:173-174`; add a test that `{veto_held:true, vetoes:[]}` → `noop "veto-open"` (NOT escalate) citing the v1→platform divergence (platform has no gen-unscoped "veto ever" signal; a literal veto-drift port regresses the `bebbf49` sticky-veto fix). Lease-role-mismatch is NOT drift (v1 `:175-176`).
- [ ] **Coherence-wiring CI test:** a `child_process` test running `list-ready.mjs` against a stub `GET /config` with an incoherent machine → asserts non-zero exit + no routing (fail-closed wiring, currently only manually smoked).
- [ ] **getJson diagnosability:** surface HTTP status on `getJson` failure so a persistent 401/403 is distinguishable from a 404 "card vanished".
- [ ] **reduce backward-edge (`reduce.ts:47`):** LATENT (conductor uses `reject.mjs`, not `reduce()`), so low urgency; recommend fixing now (small) — add a `StageDef.rejectTo?`/backward-edge source + extend `assertLifecycleCoherent` to check REJECT edges — OR document as a known limitation for the conductor→reduce migration.
- [ ] **Tighten `decide.test.ts:67`** barrier-advance assertion to exact `.toEqual` (was `toMatchObject`; the role/barrier fix itself is 2b).
- [ ] **Commit** (`fix(governance): fold Phase-1 follow-ups (board-drift parity test, coherence-wiring CI test, getJson status, reduce backward-edge)`).

---

## Phase 2a acceptance gate
- [ ] **The clean-card livelock is gone (both dispatch paths):** a clean `dev` card whose advisor returns advice/clean — dispatched via the inline-after-submit path OR the decide primary-work path — gets an ADVICE row posted → `advisor_clear` clears → advances, no re-dispatch. (Tests + a live/board-smoke walkthrough.)
- [ ] **P0-1 bar still met via the advisor self-diff:** a PR touching a watched path is blocked until the advisor (which self-diffs) posts a real review; a clean PR clears. (No board-side watch_paths matching in 2a — that's 2b.)
- [ ] **Reason visible:** VETO/HOLD/ADVICE reason persisted + surfaced on `EnrichedItem.vetoes/holds`.
- [ ] **Respawn bounded by count:** a fast CI-fail respawn loop escalates within `transition_budget`.
- [ ] **No config-lie:** budgets single-sourced; config_hash drift + dead-glob checks green in CI; no-cheap-model guard green in plugin CI.
- [ ] All suites green (`pnpm -r test` + plugin `node --test`); `pnpm -r typecheck` clean; vendored-bundle drift guard PASS; LikeC4 drift-check green.
- [ ] (AMBER) PR per repo; CI green → merge **plugin-first**; **this phase SHIPS a board deploy** (T2/T3 touch `workers/board` schema + fold) — follow `board → api → webhook`; re-apply `acme-main-v2.json` only if it changed (with a rollback ref).
- [ ] RUN-LOG updated with commit SHAs + AMBER deploy evidence.

## Self-review
- **Spec coverage:** runbook §4 Phase-2 governance bullets → tasks: board-drift (T6, mostly-done), respawn backstop (T3), persist ADVICE/clean (T1) + reason (T2), config_hash drift + no-cheap-model (T5). "Wire watch_paths into advisor required" → **honestly reframed**: the advisor self-diff already gives precision (P0-1 met by T1); board-side narrowing is a deferred cost-optimization needing an authenticated source (2b, D2). Epic/analyst + fast-lane + scanners → 2b (D1/D3). No orphan bullets. ✓
- **Security model:** 2a does NOT source any veto-authority decision from a prompt-injectable subagent (the flaw the plan-review caught in the original T3/T4). The trusted precision source is the advisor's own self-diff. ✓
- **Already-done, not re-built:** "expose children_total/done through board client" is DONE (Phase 1: `types.ts:39-40`, `decide.ts:80-84`, fold) — 2b verifies, not builds. `respawnLimit` deletion is moot (absent in platform — only in the to-be-archived old orchestrator repo). ✓
- **Deploy reality:** T2/T3 change `workers/board` → prod board deploy in the AMBER gate (unlike Phase 1). ✓
- **Types consistent:** `AdvisorFlag.reason`, `data.respawn` used identically across board/shared/core/plugin. ✓
- **Risk:** T1's two-dispatch-path handling is the crux (a partial fix leaves the engine-path livelock); the acceptance test must exercise BOTH paths.

---

## DEFERRED to Phase 2b (separate plan — carry forward; do NOT lose)
- **Board-side watch_paths-precise `advisor_clear` (cost optimization):** skip the advisor call when changed files don't match watch_paths. **HARD REQUIREMENT: an *authenticated* changed-files source** — unseal Phase-5 outbound GitHub (`GET /pulls/{n}/files`), OR the lossy-but-authenticated `push` webhook `commits[].added/modified/removed` with fail-safe-on-truncation. **NEVER** source from the developer/reviewee agent (trust downgrade → re-introduces P0-1; the plan-review knockout). Port the v1 glob matcher (`v1-eval-gates.js:71-92`, case-insensitive) into `packages/shared`; seam is `buildGateInputs` `storage.ts:403`. Keep the advisor self-diff as the source of truth for the verdict regardless.
- **Content scanners (P1-9, D3):** port v1 `run-scanners.js` + `scanners.json` (secrets/pii/payments) server-side, admin/CODEOWNERS-protected, ship disabled/opt-in; OR a scanner hit into advisor `required` (the OR-backstop, `v1-eval-gates.js:283-306`). Same authenticated-source dependency as above.
- **Epic/analyst two-tier (P1-5):** add the `analyst` role (cap + persona, mirror `agents/*.md`; job = epic→story decomposition, `CREATE{parent_id}` child stories w/ repo-qualified epic link); declare v1's proven **4-stage** epic lifecycle (analysis→decompose→integrating→done — NOT the 7-stage vision); wire a `barrier` stage + the already-built `{p:"all_children_terminal"}` predicate; **fix barrier-advance CLAIM-free** (`decide.ts:83` returns no `role` → make it promote-like, not `role:st.owner` since barrier `owner:""`); confirm `children_done` rollup on child MOVE-to-terminal; extend `assertLifecycleCoherent` to check gate-kind↔predicate; set `card_type="epic"`. NB: children counts are already exposed (Phase 1) — verify only.
- **Fast-lane entry (P1-6):** a `lanes` config block (full→spec / fast→dev) + a `create.mjs`/cockpit CREATE surface (board seam already open — `CREATE` accepts any `data.state`; `machine.initial` currently decorative). UX/config, not an engine feature.
- **First-class bulk reconcile + re-sync summary (P1-8).**
- **Explicit P2 defers (do NOT build):** risk-tier *gating* (shadow-only), `thread_budget`, `yarradev-compile`/recompile-byte-match, the 7-stage epic vision, QUESTION/ANSWER thread_budget.
