# Unification Phase 2a — Governance Precision (port v1's proven advisor/budget policy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. TDD throughout — failing test first, minimal impl, green, commit. Checkbox (`- [ ]`) steps. Obey the MASTER runbook Autonomy Contract (§1). §0 decisions are RESOLVED (recommended defaults, signed off 2026-07-02) — execute directly; override any at execution if desired.

**Goal:** Close the governance holes that bit yanyja in practice — make `advisor_clear` actually bite (auto-post clean reviews so it clears; require review precisely when a PR touches watched paths), persist *why* an advisor vetoed/held, bound respawn loops by count, and stop config from silently lying — porting v1's proven advisor + budget policy onto the platform's stronger substrate.

**Architecture:** The board (Cloudflare) owns gate *enforcement*; `orchestrator-core` routes; the plugin conductor dispatches role subagents and posts acts. Phase 2a is mostly **board-side** (`workers/board`, `packages/shared`) + a thin **plugin conductor** wiring (post ADVICE, report changed files) + **CI guards**. The core `decide` is already precision-agnostic (reads `next_transitions.failing`) and needs no change for the advisor work.

**Tech stack:** TypeScript (strict, ESNext), vitest (board/shared/core), `node:test` (plugin), esbuild (vendored bundle), Cloudflare Workers/DO/D1, pnpm workspaces, GitHub Actions CI.

## Global constraints (apply to every task)
- **The board owns server-enforced gates; the plugin/core never bypass them.** Behavioral parity with v1's *proven* policy is the bar — port what bit in yanyja, not v1's unbuilt vision.
- **Keyless:** the plugin/core never hold an LLM key or a GitHub App token. Changed-files come from the already-authenticated developer role agent (decision D2), NOT a server outbound call (`workers/webhook/src/outbound.ts` stays sealed).
- **Additive, guarded migrations only** (DO SQLite via `_migrations`); no destructive schema changes. Keep every existing suite green (board/api/shared/dashboard/mcp/webhook/orchestrator-core + plugin `node:test`) + `pnpm -r typecheck` + the vendored-bundle drift guard + LikeC4 drift-check.
- **One authoritative source per config concern** — `watch_paths` and budgets are currently multi-modeled + partly dead; Phase 2a single-sources them.
- **Cite `path:line`; TDD, DRY, YAGNI, frequent commits.** Any core change ⇒ rebuild the vendored `.mjs` (`pnpm --filter @yarradev/orchestrator-core build`) + re-run `platform/scripts/check-vendored-core.sh`.
- **Cross-repo merge order (from Phase 1):** platform `core.yml` diffs the rebuilt bundle against the plugin's default branch → the **plugin PR merges before/with the platform PR**.

---

## 0. DECISIONS (RESOLVED — recommended defaults, 2026-07-02)

- [x] **D1 — Phase 2 is SPLIT.** This plan = **Phase 2a: governance precision** (the "what bit in practice" cluster). **Phase 2b (deferred, separate plan): epic/analyst two-tier + fan-in wiring + analyst role/persona, fast-lane entry, content scanners.** Rationale: 2a closes the P0-1/P1-2/P1-3/P1-4 governance holes (highest evidence-ranked value); 2b adds new capability and rivals Phase 1 in size. See §Deferred for the 2b scope carried forward.
- [x] **D2 — Changed-files source = the developer role agent reports `changed_files[]` in its LINK_PR/PUSH act.** Keyless, no server outbound, does not pull the sealed Phase-5 `outbound.ts` forward. `ActInput.data` is untyped (`packages/shared/src/types.ts:17`) so this is a purely additive wire change. (Rejected: unseal outbound GitHub early; lossy inbound push events.)
- [x] **D3 — Content scanners DEFERRED to Phase 2b.** The `watch_paths` pipeline is the real P0-1 win; v1 shipped scanners inert (disabled-by-default, "phase 6"), and they depend on the changed-files pipeline this plan builds. Port them in 2b, on top of D2's pipeline.
- [x] **D4 — Respawn backstop = COUNT respawn CLAIMs toward `transitions_count` + keep the time-window secondary.** v1 parity (v1 counts MOVE+CLAIM+REJECT in one cumulative counter). The `decide` leg-4 backstop already reads `transitions_count`; bumping it on a respawn CLAIM makes a stuck CI-fail loop escalate within budget. Keep `respawn_window_ms` as the secondary bound.

---

## Scope map (Phase 2a items → v1/parity provenance)
| Task | Item | Provenance | Blast radius |
|---|---|---|---|
| 1 | Auto-post ADVICE (fix the clean-card advisor livelock) | P1-2; Phase-0 deferral | plugin + core (bundle) |
| 2 | Persist advisor `reason` (VETO/HOLD/ADVICE) | P1-2; Phase-1 follow-up | board + shared + core |
| 3 | Developer reports `changed_files[]` (LINK_PR/PUSH) | P0-1 precise (D2) | plugin persona + core + board |
| 4 | `watch_paths`-precise `advisor_clear` + one authoritative watch_paths | P0-1 (interim→precise), P1-9-adjacent | board + shared |
| 5 | Respawn backstop — count respawn CLAIMs (D4) | P1-4 | plugin + board |
| 6 | Dead-budget cleanup / single-source | gap-analysis; survey | shared + plugin config |
| 7 | CI guards: config_hash drift + dead-glob + no-cheap-model | P1-7, P1-9 | platform CI + scripts |
| 8 | Fold Phase-1 follow-ups + board-drift parity confirm | Phase-1 review; P1-3 | core + tests + CI |

---

## Target file structure (touch map)
**platform/workers/board/src/**
- `schema.ts` — add `advisor_state.reason TEXT` (guarded migration) [T2]; `derived_json.changed_files` shape [T3].
- `storage.ts` — `setAdvisorFlag`/`recordAdvice` thread `reason` [T2]; LINK_PR/PUSH fold stores `changed_files` for head [T3]; `buildGateInputs` advisor block: `required` intersects `watch_paths`×`changed_files` [T4]; CLAIM fold bumps `transitions_count` on `data.respawn` [T5]; expose `reason` on the vetoes/holds projection [T2].

**platform/packages/shared/src/**
- `types.ts` — `AdvisorFlag { role; reason? }` [T2]; `NextTransition`/`EnrichedItem` unchanged.
- `gates.ts` — no change to `advisor_clear` *predicate* (it reads `AdvisorInput.required/clear`); the change is in how `buildGateInputs` sets `required` [T4].
- `glob.ts` (new) — port v1 `globToRegExp` + `watchMatch` (case-insensitive) [T4].
- `budgets.ts` / `compile.ts` — single-source budgets; drop dead `transition_budget` copies [T6].

**platform/packages/orchestrator-core/src/**
- `boardClient.ts` — add `advice(id, head, reason?)` [T1]; `linkPr`/`push` accept + send `changed_files` [T3].
- `reduce.ts` — ADVICE act carries `verdict.reason` [T1]; VETO/HOLD unchanged (already send reason).
- `decide.ts` — **no change** for advisor precision; tighten the barrier test only if touched. Respawn CLAIM `data.respawn` is set by the conductor, not decide.

**yarradev-board/skills/yarradev-board-run/**
- `scripts/advice.mjs` (new) [T1]; `scripts/claim.mjs` — accept a `--respawn` flag [T5]; `scripts/vendor/core.mjs` — rebuilt bundle [T1,T3].
- `SKILL.md` — advice/clean → POST ADVICE (not log-only) [T1]; respawn CLAIM passes the flag [T5]; developer verdict includes `changed_files` [T3].
- `agents/developer.md` — emit `changed_files[]` in the submitted/PUSH verdict [T3]; `config/board.json` — single-source `watch_paths` [T4,T6].

**platform/scripts/ + .github/workflows/**
- `scripts/check-config-hash.sh` (new) + workflow step [T7]; `scripts/check-watch-paths.sh` (new, dead-glob) [T7]; extend `check-vendored-core`/CI for the no-cheap-model guard [T7]; a `child_process` coherence-wiring test [T8].

---

## Tasks

### Task 1: Auto-post ADVICE — fix the clean-card advisor livelock  *(most urgent; the mechanism is built but never called)*
**Why:** board+core ADVICE handling is already correct (`storage.ts:888-897` fold, gen-scoped head-fresh `advisor_clear` in `buildGateInputs`), but the deployed conductor logs advice/clean instead of posting it (`SKILL.md` "advice/clean → log only"; no `advice.mjs`; no `boardClient.advice()`). Net effect: a clean `dev` card that's never vetoed has no `advisor_state` row → `advisor_clear` false forever (the non-vacuous `!!asr` guard) → `decide` re-dispatches the advisor **every tick** with no escape. This is the Phase-0 operational deferral.
**Files:** Modify `platform/packages/orchestrator-core/src/{boardClient.ts,reduce.ts}`; Create `yarradev-board/skills/yarradev-board-run/scripts/advice.mjs`; Modify `yarradev-board/skills/yarradev-board-run/SKILL.md`; rebuild `scripts/vendor/core.mjs`. Tests: `packages/orchestrator-core/test/boardClient.test.ts`, `test/reduce.test.ts`; plugin `test/` (advice path).
**Interfaces produced:** `BoardClient.advice(id: string, head: string, reason?: string): Promise<AppendResult>` posting `{type:"ADVICE", item_id:id, data:{reviewed_head:head, reason}}` (gen-exempt).
- [ ] **Step 1 — failing test (core):** `boardClient.test.ts` — `advice("c1","abc","looks fine")` posts `{type:"ADVICE",item_id:"c1",gen:null,data:{reviewed_head:"abc",reason:"looks fine"}}` (assert method/path/body via fake fetch). `reduce.test.ts` — an `{status:"advice", head, reason}` verdict → `[{type:"ADVICE", data:{reviewed_head:head, reason}}]` (currently drops `reason` at `reduce.ts:71`).
- [ ] **Step 2 — run, expect FAIL** (`pnpm --filter '@yarradev/orchestrator-core' test`).
- [ ] **Step 3 — implement:** add `advice()` to `boardClient.ts` (mirror `veto()`/`hold()` at `:204-209`); `reduce.ts:69-71` `advice`/`clean` → `data:{ reviewed_head: verdict.head, reason: verdict.reason ?? "" }`.
- [ ] **Step 4 — run PASS** + typecheck. Rebuild bundle (`pnpm --filter '@yarradev/orchestrator-core' build`), regen `vendor/core.mjs.sha256`, run `platform/scripts/check-vendored-core.sh` (GREEN).
- [ ] **Step 5 — plugin wiring:** create `advice.mjs` (mirror `veto.mjs`: `advice.mjs <id> <head> [reason...]` → `client.advice(...)`); in `SKILL.md`, change the advisor-verdict branch so `advice`/`clean` → `node $S/advice.mjs <id> <head> <reason>` (POST), not log-only. Plugin `node --test` green (add a test that the advice path posts an ADVICE act, or assert the SKILL contract via the client test if no harness).
- [ ] **Step 6 — commit** both repos (`fix(governance): auto-post ADVICE on clean advisor review — closes the clean-card advisor livelock`).

### Task 2: Persist advisor `reason` (VETO/HOLD/ADVICE)  *(surface WHY to a human)*
**Why:** `reduce`/`boardClient` send `data.reason` for VETO/HOLD (`reduce.ts:66,68`) but the fold (`setAdvisorFlag` `storage.ts:589-608`) never stores it — `advisor_state` has no `reason` column (`schema.ts:186-195`); reason survives only in the immutable act log, unreachable from `advisor_state`/`EnrichedItem`. A human viewing a vetoed card sees no reason.
**Files:** Modify `platform/workers/board/src/{schema.ts,storage.ts}`; `platform/packages/shared/src/types.ts`. Tests: `workers/board/test/` (fold + projection).
- [ ] **Step 1 — failing test:** a VETO with `data:{reason:"touches auth without review", head}` → after fold, the card's enriched `vetoes[]` entry carries `{role:"security-advisor", reason:"touches auth without review"}`; an ADVICE with a reason persists it too.
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** add `reason TEXT` to `advisor_state` (guarded additive migration in `schema.ts` per the `_migrations` pattern); thread a `reason` param through `setAdvisorFlag` (`storage.ts:589-608`) + `recordAdvice` (`:621-632`); read it in the vetoes/holds projection (`storage.ts:1525-1531`); add `reason?: string` to `AdvisorFlag` (`packages/shared/src/types.ts:129-131`) so `EnrichedItem.vetoes/holds` expose it.
- [ ] **Step 4 — PASS** + board/shared typecheck + full board suite green. **Step 5 — commit** (`feat(governance): persist + surface advisor veto/hold/advice reason`).
  - **NB:** additive column + additive optional type field — backward compatible; existing rows get `reason=NULL`. Watch the `veto_held`(item) vs `veto_open`(advisor_state) naming asymmetry — do NOT conflate.

### Task 3: Developer reports `changed_files[]` (LINK_PR / PUSH)  *(the changed-files pipeline — prerequisite for T4)*
**Why (D2):** the board has no PR changed-files today (`webhook/src/extract.ts` carries none; outbound GitHub is sealed). The keyless source is the developer role agent, which already runs with the user's git/gh creds and emits the LINK_PR/PUSH verdict.
**Files:** Modify `yarradev-board/agents/developer.md` (verdict contract); `platform/packages/orchestrator-core/src/{reduce.ts,boardClient.ts}` (carry `changed_files`); `platform/workers/board/src/storage.ts` (LINK_PR/PUSH fold stores changed-files-for-head); `packages/shared/src/types.ts` (derived shape). Tests: reduce/boardClient (core) + board fold.
- [ ] **Step 1 — failing tests:** (core) `submitted` verdict with `evidence.changed_files:["src/auth/login.ts"]` → the LINK_PR/PUSH act `data` includes `changed_files`. (board) folding a LINK_PR/PUSH with `data.changed_files` + `head` stores `derived_json.changed_files = {head, files}` (mirror the existing `derived_json.review:{state,head}` pattern), readable in `buildGateInputs`.
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** `developer.md` — the submitted verdict includes `"changed_files": ["<repo-relative path>", …]` (from `git diff --name-only origin/<base>...HEAD`); `reduce.ts` submitted→LINK_PR/PUSH (`:51-56`) carries `changed_files`; `boardClient.linkPr/push` accept + send it; board fold stores it head-scoped (a `changed_files_json` column on `item`, or `derived_json.changed_files`) so a new PUSH (new head) replaces it and it goes stale exactly like `review`.
- [ ] **Step 4 — PASS** + rebuild bundle + drift guard + typecheck. **Step 5 — commit** both repos (`feat(governance): developer reports changed_files in LINK_PR/PUSH (keyless changed-files pipeline)`).
  - **Fallback documented:** if `changed_files` is absent on an act (older agent), T4 must treat "unknown files" as **fail-safe = advisor required** (never auto-clear on missing data on a security gate).

### Task 4: `watch_paths`-precise `advisor_clear` + one authoritative watch_paths  *(the P0-1 interim→precise headline)*
**Why:** today `advisor_clear` requires a review at every `dev` card (interim). Precise = require it only when `changed_files ∩ watch_paths ≠ ∅`. Seam is board-side only (`buildGateInputs` `storage.ts:384-406`); `decide.ts` needs **no** change (it reads `next_transitions.failing`, precision-agnostic — its own comment says so at `:91-94`).
**Files:** Create `platform/packages/shared/src/glob.ts`; Modify `platform/workers/board/src/storage.ts` (`buildGateInputs` advisor `required`); single-source `watch_paths` (`yarradev-board/.../config/board.json` ← remove, keep only the compiled `acme-main-v2.json` advisor block as authoritative, OR vice-versa — pick one and delete the other); extend `assertLifecycleCoherent` (`orchestrator-core/src/config.ts`) to validate advisors exist. Tests: `packages/shared/test/glob.test.ts`, `workers/board/test/` (buildGateInputs precision), `compile.test.ts`.
- [ ] **Step 1 — failing tests:** (glob) port v1 `globToRegExp` (`v1-eval-gates.js:71-92`, case-insensitive; `**`→`.*`, `*`→`[^/]*`, `?`→`[^/]`) + `watchMatch(files, patterns)`; assert `**/auth/**` matches `src/auth/Login.ts` (case-insensitive) and does NOT match `src/ui/button.ts`. (board) a card in `dev` with `changed_files:["src/ui/x.ts"]` (no watch match) → `advisor_clear` **passes with no review** (advisor not required); with `changed_files:["src/auth/x.ts"]` → `advisor_clear` fails until a review exists; with **missing** changed_files → fail-safe advisor required.
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** `buildGateInputs` advisor block (`storage.ts:403`): `required = (a.joins_at ?? []).includes(state) && watchMatch(changedFilesForHead, a.watch_paths ?? [])` — where `changedFilesForHead` is read head-scoped (stale if a PUSH changed the head, exactly like `review`); missing changed-files ⇒ `required=true` (fail-safe). `clear` unchanged. Extend `assertLifecycleCoherent` to assert every `advisor_clear`-referencing advisor role has a config entry (catches the config-lie class).
- [ ] **Step 4 — PASS** — add fresh tests at the `buildGateInputs`/`compile` layer (the corpus does NOT test path-matching — `translate.ts:91-96` synthesizes `failing` from the case label; do not rely on it here). **Step 5 — commit** (`feat(governance): watch_paths-precise advisor_clear (P0-1 interim→precise) + one authoritative watch_paths`).
  - **Security note (call out in the PR):** this NARROWS when a review is mandatory (always→only-on-match). The fail-safe (missing files ⇒ required) + the T7 dead-glob check are the guardrails; v1's content-scanner OR-backstop is the Phase-2b complement.

### Task 5: Respawn backstop — count respawn CLAIMs toward the transition budget  *(D4)*
**Why:** respawn is bounded only by a 60s time-window (`decide.ts:109-115`); a fast CI-fail loop within the window is unbounded by count. v1 counted every CLAIM. `transitions_count` bumps only on MOVE/REJECT (`storage.ts:780-794`); CLAIM never touches it.
**Files:** Modify `yarradev-board/skills/yarradev-board-run/scripts/claim.mjs` + `SKILL.md` (thread a respawn flag); `platform/workers/board/src/storage.ts` (CLAIM fold). Tests: `workers/board/test/` (respawn CLAIM bumps count), plugin claim script.
- [ ] **Step 1 — failing test:** a CLAIM with `data.respawn === true` increments `item.transitions_count`; a normal CLAIM does not; after `transition_budget` (50) respawns, `decide`'s leg-4 backstop (`decide.ts:43-45`, reads `transitions_count`) returns `escalate "transition-budget"`.
- [ ] **Step 2 — FAIL** → **Step 3 — implement:** `claim.mjs` accepts a 4th `--respawn` arg → posts CLAIM with `data:{respawn:true, ...}`; `SKILL.md` step-1 for `kind==="respawn"` passes it (the `decide` result already carries `kind:"respawn"`, `list-ready.mjs`). Board CLAIM fold (`storage.ts:949-979`): when `data.respawn`, add `transitions_count = transitions_count + 1` to the existing `UPDATE item …` (option a — decide's leg-4 + any `within_budget{transitions}` gate then catch it for free). Keep the `respawn_window_ms` leg as the secondary bound (no change).
- [ ] **Step 4 — PASS** + rebuild bundle if core touched (it isn't — plugin+board only) + typecheck. **Step 5 — commit** both repos (`feat(governance): count respawn CLAIMs toward transition budget (v1 parity); time-window secondary`).

### Task 6: Dead-budget cleanup — single-source, stop the config-lie
**Why:** `transition_budget`/`respawn_window_ms` are dead in ≥3 places (`board.json:21` never read; `acme-main-v2.json:87` `transition_budget` unused-by-any-gate; only live value = `decide`'s hardcoded `DEFAULT_BUDGETS`). TWO unsynced `DEFAULT_BUDGETS` constants (`orchestrator-core/config.ts:20-23` vs `shared/budgets.ts:16-19`). A write-only dead `counterInc(id,"*")` (`storage.ts:795`).
**Files:** Modify `packages/shared/src/budgets.ts` + `orchestrator-core/src/config.ts` (reconcile/alias); `yarradev-board/.../config/board.json` (strike dead fields OR document as advisory); `storage.ts:795` (remove dead counter OR repurpose for T5). Tests: existing budget tests stay green; add a note test.
- [ ] **Step 1 — decide + document the single source:** the live transition-budget enforcement is `decide`'s `DEFAULT_BUDGETS.transition_budget` (client-side). Board-enforced = `bounce_limit`/`per_edge_overrides` via `within_budget{bounces}` gates + the hardcoded REJECT backstop (`storage.ts:1942-1949`). Action: strike `transition_budget`/`respawn_window_ms` from `board.json` (they're inert) OR add a `_note` marking them advisory; make the two `DEFAULT_BUDGETS` reference one shared constant (import `shared/budgets.ts` into `orchestrator-core` OR document why they differ). Remove the dead `counterInc(id,"*")` unless T5 repurposed it.
- [ ] **Step 2 — tests green** (no behavior change; a hygiene commit). **Step 3 — commit** (`refactor(governance): single-source budgets; remove dead transition_budget copies + dead counter`).

### Task 7: CI guards — config_hash drift + dead-glob + no-cheapest-model-on-veto
**Why:** v1 specced but never built a config-drift check (P1-7); watch_paths need a static coverage check; the no-cheap-model-on-veto guard (yanyja's `legal-advisor: haiku` slipped) should generalize across advisors.
**Files:** Create `platform/scripts/check-config-hash.sh`, `platform/scripts/check-watch-paths.sh`; Modify a platform workflow (`.github/workflows/core.yml` or a new `config.yml`); a guard over advisor model config. Tests: the scripts' RED-on-drift behavior (TDD like the vendored-core guard).
- [ ] **Step 1 — failing checks:** `check-config-hash.sh` compiles the committed `scripts/configs/acme-main-v2.json` (via `compile()`) and diffs the resulting machine/hash against a committed snapshot (or, opt-in, live `GET /config`) — fails on drift. `check-watch-paths.sh` asserts every advisor `watch_paths` glob is well-formed + non-empty (dead-glob detector). A guard asserting no advisor with `authority: veto` is configured to a cheapest-tier model.
- [ ] **Step 2 — FAIL (on a seeded drift/bad-glob)** → **Step 3 — implement** the scripts + wire into CI (fail closed). **Step 4 — PASS. Step 5 — commit** (`ci(governance): config_hash drift + dead-glob + no-cheap-model-on-veto guards`).

### Task 8: Fold Phase-1 follow-ups + board-drift parity confirm
**Why:** close the small Phase-1 review carry-forwards + confirm the board-drift port (which is already mostly done — a naive full v1 port would REGRESS the `bebbf49` sticky-veto fix).
**Files:** `orchestrator-core/test/decide.test.ts` (tighten `:67` weak `toMatchObject`); a `child_process` coherence-wiring test for `list-ready.mjs` (T8 follow-up); `boardClient.ts`/`list-ready.mjs` getJson status diagnosability; `reduce.ts:47` backward-edge (see note); a board-drift parity test + doc.
- [ ] **Board-drift:** confirm `decide.ts:58` (blocked-drift) matches v1 `eval-gates.js:173-174`; add a test that `{veto_held:true, vetoes:[]}` → `noop "veto-open"` (NOT escalate) with a comment citing the v1→platform divergence (the platform has no gen-unscoped "veto ever" signal; a literal port regresses `bebbf49`). Lease-role-mismatch is explicitly NOT drift (v1 `:175-176`).
- [ ] **Coherence-wiring CI test:** a `child_process` test that runs `list-ready.mjs` against a stub `GET /config` returning an incoherent machine → asserts non-zero exit + no routing (the fail-closed wiring, currently only manually smoked).
- [ ] **getJson diagnosability:** surface HTTP status on `getJson` failure so a persistent 401/403 is distinguishable from a 404 "card vanished" (`list-ready.mjs` logs it distinctly).
- [ ] **reduce backward-edge (`reduce.ts:47`):** it's LATENT (conductor uses `reject.mjs` directly, not `reduce()`), so low urgency — either add a `StageDef.rejectTo?`/backward-edge source now (and extend `assertLifecycleCoherent` to check REJECT edges) OR document it as a known limitation to fix when the conductor migrates to `reduce()`. Recommend: fix now (small) since it's a correctness bug in shipped core.
- [ ] **Tighten `decide.test.ts:67`** barrier-advance assertion to exact `.toEqual` (was `toMatchObject`, let the missing-role bug slip — the role/barrier fix itself is Phase 2b).
- [ ] **Commit** (`fix(governance): fold Phase-1 follow-ups (board-drift parity test, coherence-wiring CI test, getJson status, reduce backward-edge)`).

---

## Phase 2a acceptance gate
- [ ] **The clean-card livelock is gone:** a clean `dev` card (never vetoed) that gets an advice/clean verdict has an `advisor_state` row posted → `advisor_clear` clears → it advances dev→test without re-dispatching the advisor every tick. (Test + a live/board-smoke walkthrough.)
- [ ] **Precise advisor gate:** a `dev` card whose `changed_files` DON'T match `watch_paths` advances with no review required; one that DOES match blocks until a review; missing changed-files ⇒ fail-safe required. (board tests.)
- [ ] **Reason visible:** VETO/HOLD/ADVICE reason is persisted + surfaced on `EnrichedItem.vetoes/holds`.
- [ ] **Respawn bounded by count:** a CI-fail respawn loop escalates within `transition_budget` (not just the time-window).
- [ ] **No config-lie:** budgets single-sourced; config_hash drift check + dead-glob check green in CI.
- [ ] All suites green (`pnpm -r test` platform + plugin `node --test`); `pnpm -r typecheck` clean; vendored-bundle drift guard PASS; LikeC4 drift-check green. Bundle rebuilt for every core change.
- [ ] (AMBER) PR per repo; CI green → merge **plugin-first**; deploy decision (T2/T3/T4/T5 touch `workers/board` = **prod worker code → this phase SHIPS a board deploy**, unlike Phase 1 — follow the `board → api → webhook` deploy order; re-apply the `acme-main-v2.json` config if watch_paths single-sourcing changed it, with a rollback ref).
- [ ] RUN-LOG updated with commit SHAs + the (AMBER) deploy/config-apply evidence.

## Self-review
- **Spec coverage:** every Phase-2 runbook §4 governance bullet maps to a task — board-drift (T8, mostly-done), respawn backstop (T5), persist ADVICE/clean (T1) + reason (T2), watch_paths→advisor required (T3+T4), config_hash drift (T7), no-cheap-model guard (T7). Epic/analyst tier + fast-lane + scanners are D1/D3-DEFERRED to 2b (below), not dropped. ✓
- **The board-drift trap is flagged:** T8 explicitly does NOT port v1's veto-drift (it would regress `bebbf49`); it ports only the safe blocked-half (already present) + documents the divergence. ✓
- **Deploy reality:** unlike Phase 1 (client-side only), Phase 2a changes `workers/board` (schema + gate logic) → a prod board deploy + possible config re-apply are in the AMBER gate. Called out. ✓
- **Types consistent:** `AdvisorFlag.reason`, `changed_files`, `data.respawn` names used identically across board/shared/core/plugin. ✓
- **No placeholders** except the explicitly-flagged D-decisions (resolved) + T8's reduce-backward-edge fix-now-vs-defer (recommendation given). ✓
- **Risk:** T3+T4 (changed-files pipeline + precise gate) is the crux — it narrows a security gate, so the fail-safe (missing files ⇒ required) + dead-glob check + the deferred scanner OR-backstop are the compensating controls; land T3 before T4.

---

## DEFERRED to Phase 2b (separate plan — carry forward; do NOT lose)
Grounded scope from the same surveys, for the next `writing-plans` pass:
- **Epic/analyst two-tier (P1-5):** add the `analyst` role (cap + persona, mirror `agents/*.md`; job = epic→story decomposition, `CREATE{parent_id}` child stories with a repo-qualified epic link, upstream of designer); declare v1's proven **4-stage** epic lifecycle (analysis→decompose→integrating→done — NOT the 7-stage vision doc); wire a `barrier` stage + the already-built `{p:"all_children_terminal"}` predicate; **fix the barrier-advance CLAIM-free** (`decide.ts:83` returns no `role` → make it promote-like, not `role:st.owner` since barrier `owner:""`); confirm `children_done` rollup on child MOVE-to-terminal; extend `assertLifecycleCoherent` to check gate-kind↔predicate; set `card_type="epic"`.
- **Fast-lane entry (P1-6):** a `lanes` config block (full→spec / fast→dev) + a `create.mjs` / cockpit CREATE surface (the board seam is already open — `CREATE` accepts any `data.state`; `machine.initial` is currently decorative). UX/config, not an engine feature.
- **Content scanners (P1-9, D3):** port v1 `run-scanners.js` + `scanners.json` (secrets/pii/payments) server-side (regex-over-diff in a Worker, ReDoS-capped, admin/CODEOWNERS-protected), ship **disabled/opt-in** like v1; OR a scanner hit into advisor `required` (the OR-backstop to watch_paths, `v1-eval-gates.js:283-306`). Depends on T3's changed-files pipeline.
- **First-class bulk reconcile + re-sync summary (P1-8):** operator-ergonomic bulk fix.
- **Explicit P2 defers (do NOT build):** risk-tier *gating* (shadow-only), `thread_budget` (never built in v1), `yarradev-compile`/recompile-byte-match (never built), the 7-stage epic vision, QUESTION/ANSWER thread_budget.
