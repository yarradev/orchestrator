# Unification Phase 1 — Unify the Code (extract `orchestrator-core`, one `decide`, one client) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. TDD throughout — failing test first, minimal impl, green, commit. Checkbox (`- [ ]`) steps. Obey the MASTER runbook Autonomy Contract (§1). **This plan has open DECISIONS (§0) that must be confirmed before execution — it was drafted to be reviewed first.**

**Goal:** Collapse the three drifting decision engines (orchestrator-repo `core/decide.ts`, plugin `decide.mjs`, platform `orchestrator/src/decide.ts`) into ONE typed `orchestrator-core` — `EnrichedItem`-native, single Cloudflare backend, no adaptor seam — bundled to a vendored `.mjs` the plugin ships; retire the platform stub to a contract test; single-source the lifecycle.

**Architecture:** `orchestrator-core` (authored TS, tested with vitest) exposes `decide` / `reduce` / `parseVerdict` / a typed `boardClient` / `config`, binding directly to the board's native `EnrichedItem` + `ActInput` + `BoardMachine` (from `@yarradev/shared`). A build step bundles it (esbuild) to a single self-contained ESM `.mjs` committed into the plugin; the plugin's hand-rolled `decide.mjs` + `lib.mjs` are deleted and its CLI scripts + conductor import the vendored core. The `BoardBackend` interface, both adaptors, the `YD_BACKEND` factory, `CanonicalCard`, and the neutral `Op` layer are dropped (one backend ⇒ no polymorphism, no mapping).

**Tech stack:** TypeScript (strict, ESNext), vitest (core tests), esbuild (bundle), `node:test` (plugin's own suite), pnpm workspaces, Cloudflare board HTTP API.

## Global constraints (apply to every task)
- **One backend (Cloudflare).** No `BoardBackend` seam, no `CanonicalCard`, no neutral `Op` layer, no `YD_BACKEND`. The core binds to the board's native types.
- **`EnrichedItem` is the card model** (from `@yarradev/shared`). `decide` reasons over it directly; `reduce` emits `ActInput[]` directly.
- **One `decide` (no drift).** After this phase the plugin has no hand-maintained `decide.mjs`/`lib.mjs`; both are the bundled core.
- **Behavioral parity is the bar.** The ported v1 `cases.json` corpus + the current plugin `decide.mjs` behavior are the oracle — the new core must not regress observable routing.
- **Bundled core is self-contained** — zero runtime npm dep; the plugin imports a single vendored `.mjs`.
- **TDD, DRY, YAGNI, frequent commits.** No schema migration in this phase. Keep every existing suite green (board/api/shared/dashboard/mcp/webhook + plugin `node:test`).
- **Cite `path:line`; the board is authoritative — never bypass gates/fences.**

---

## 0. DECISIONS TO CONFIRM BEFORE EXECUTION

These materially shape the plan. Recommendations given; confirm or override before Task 1.

- [x] **D1 — Where does the core source live? → RESOLVED (2026-07-02): Option A — `platform/packages/orchestrator-core/`.** (Decided during the LikeC4 target-model session; the model now places `orchestratorCore` as a first-party platform container.)
  - **Option A (RECOMMENDED): `platform/packages/orchestrator-core/`** — a new workspace package in the platform monorepo. *Pros:* imports `EnrichedItem`/`ActInput`/`BoardMachine` directly from `@yarradev/shared` (single source of truth, zero type drift); reuses the platform's tsc+vitest+esbuild toolchain; the plugin stays a lean zero-build artifact that only ships the bundled `.mjs`. *Con:* diverges from design §2's picture of core "inside the plugin" — here the *authored source* is in platform, the *bundle* ships in the plugin. Repo count still collapses to 3 (core absorbed into platform, `yarradev/orchestrator` archived in Phase 3).
  - **Option B: `yarradev-board/core/` (TS in the plugin repo)** — matches design §2 literally ("plugin absorbs core"). *Con:* the lean plugin gains a full tsc+esbuild+vitest toolchain, and must **vendor** the board-protocol types (`EnrichedItem`, `ActInput`, `BoardMachine`) with a CI drift-check against `@yarradev/shared` — duplicated types, more moving parts.
  - This plan is written for **Option A**. If B is chosen, Tasks 1/2/6 change (types vendored + drift-check; toolchain added to the plugin).

- [x] **D2 — v1 `cases.json` test corpus (RESOLVED + FROZEN).** Verified: v1 `yarrasys/yarradev` has **64 cases** at `skills/yarradev-run/fixtures/cases.json`. **Frozen into this repo** at `orchestrator/docs/phase1-oracle/v1-cases.json` (+ `v1-eval-gates.js`, the reference decision engine) so Task 4 does not depend on v1 surviving Phase 3's archival. Two porting caveats the executor MUST heed:
  - **The corpus is in v1's schema, not `EnrichedItem`.** Each case is `{_name, _expect:{action, claim_role, claim_epoch, set_stage_to, ...}, stage, overlays{agent_running,blocked,veto_held}, current_epoch, lease, completion{terminal,output_present}, checks{ci_green}, pr{linked,changed_files}, advisors{<role>:{reviewed_at_epoch,veto_open,veto_ever}}, counters{transitions,bounces}, risk{...}}`. Task 4 writes a **translation layer** (v1-case → `EnrichedItem` + `BoardMachine`/lifecycle) + maps the **`_expect.action`** to the core `Action`. Do NOT port `_expect.ops` — those (`add-label`/`remove-label`/`update-pin`/`post`) are GitHub-Issues-backend ops, deleted here; assert on the core `Action` (kind/role/to), not on GitHub ops.
  - **`_expect.action` vocabulary (13) → core scope:** in-scope-Phase-1 → `spawn`(→work), `advance`, `noop`, `reclaim`, `advance-backward`(→the reject/backward path), `block`(→route/park), `unblock`, `veto-clear`(→resume/noop; clear is board-enforced), `spawn-advisor`(→work: dispatch the advisor — see Task 4 note), `veto-hold`/`advisor-hold`(→park/noop). **Deferred (mark `_deferred:true`, skip-with-note in the Phase-1 corpus test):** `risk-gate`(2 cases; design §E risk tiers are shadow-only until a later phase).

- [ ] **D3 — `reduce` emits board `ActInput[]` directly** (no neutral `Op[]`). Design §3.1 names board acts (MOVE/REJECT/VETO/HOLD/…). The neutral `Op` union + `opToAct` were the adaptor seam being deleted. Confirm: drop `Op`, `reduce(verdict, card, machine): ActInput[]`.

- [ ] **D4 — advice/clean → the `ADVICE` act (from Phase 0 P0-1).** Phase 0 added the `ADVICE` act (records a clean advisor review at `reviewed_head`). `reduce` maps `advice`/`clean` verdicts → an `ADVICE` act — which is exactly the "persisted reviewed-head record" design §3.1 called for, and closes the Phase-0 operational watch-item (orchestrator must emit ADVICE so a watched-path card can clear `advisor_clear`). Confirm this is Phase 1 scope (recommended — it's a 1-line reduce branch and it makes the P0-1 gate usable end-to-end).

- [ ] **D5 — Keep a test-only fake for the core, not a pluggable backend.** Drop `BoardBackend` polymorphism, but keep an in-memory fake of the ONE `boardClient` (a scripted `fetch` or a fake client object) for `decide`/`reduce`/`runPass` tests. Confirm.

---

## Target file structure (Option A)

**New — `platform/packages/orchestrator-core/`:**
- `package.json` — `@yarradev/orchestrator-core`, private, dep `@yarradev/shared` (workspace:*); scripts `typecheck`/`test`/`build` (`build` = esbuild bundle → the plugin path).
- `tsconfig.json` — strict, composite; referenced by nothing else (leaf).
- `vitest.config.ts`
- `src/index.ts` — barrel: `decide`, `reduce`, `parseVerdict`, `BoardClient`, `loadLifecycle`, types.
- `src/types.ts` — `Action` (decide's return), `Verdict` (agent verdict), `TeamPolicy`; re-exports `EnrichedItem`/`ActInput`/`BoardMachine` from `@yarradev/shared`.
- `src/decide.ts` — `decide(card: EnrichedItem, lifecycle: Lifecycle, policy: TeamPolicy, nowMs): Action`, `EnrichedItem`-native.
- `src/reduce.ts` — `reduce(verdict: Verdict, card: EnrichedItem, lifecycle: Lifecycle): ActInput[]`.
- `src/verdict.ts` — `parseVerdict(text): Verdict`.
- `src/boardClient.ts` — the one typed HTTP client (reads + all act helpers).
- `src/config.ts` — `loadLifecycle(machine)` / coherence check (lifecycle from `GET /config`).
- `test/*.test.ts` + `test/fixtures/cases.json` (ported from v1) + `test/fixtures/lifecycle.ts`.

**New — `platform/examples/board-smoke/`:** minimal LLM-free HTTP contract test (replaces `platform/orchestrator/`).

**Modified — `yarradev-board/`:**
- `skills/yarradev-board-run/scripts/vendor/core.mjs` — the committed bundle (build output).
- `scripts/decide.mjs`, `scripts/lib.mjs` — **deleted**; CLI wrappers + `list-ready.mjs` re-point to `vendor/core.mjs`.
- `scripts/config-trust.mjs` — **kept** (plugin-specific security policy, not board protocol).
- `SKILL.md` conductor — unchanged behavior; imports flow through the vendored core.
- CI `ci.yml` — add a step that rebuilds the bundle and asserts it matches the committed `vendor/core.mjs`.

**Removed (Phase 3 archives the whole `yarradev/orchestrator` repo):** `backend.ts`, `adaptor-github`, `adaptor-board`, `cli/backend-factory.ts`, `CanonicalCard`, neutral `Op`. We do **not** edit the orchestrator repo to delete these — we simply do not carry them into `orchestrator-core`; the repo is archived in Phase 3.

---

## Tasks

### Task 1: Scaffold `orchestrator-core` package
**Files:** Create `platform/packages/orchestrator-core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`; Modify `platform/pnpm-workspace.yaml` (already globs `packages/*` — verify it picks up the new pkg); Test: `platform/packages/orchestrator-core/test/smoke.test.ts`.
**Interfaces produced:** the package name `@yarradev/orchestrator-core` + an empty barrel.
- [ ] **Step 1 — failing test** `test/smoke.test.ts`: `import { version } from "../src/index"; expect(version).toBe("0.1.0")`.
- [ ] **Step 2 — run, expect FAIL** (`pnpm --filter '@yarradev/orchestrator-core' test`).
- [ ] **Step 3 — implement:** `package.json` (dep `@yarradev/shared: workspace:*`, scripts `test`/`typecheck`/`build`), `tsconfig.json` (extend `../../tsconfig.base.json`), `src/index.ts` exporting `const version = "0.1.0"`.
- [ ] **Step 4 — run, expect PASS**; `pnpm install` re-links the workspace; `pnpm --filter '@yarradev/orchestrator-core' typecheck` clean.
- [ ] **Step 5 — commit** (`feat(core): scaffold @yarradev/orchestrator-core workspace package`).

### Task 2: Core types + `parseVerdict`
**Files:** Create `src/types.ts`, `src/verdict.ts`; Test: `test/verdict.test.ts`. Port `parseVerdict` from `orchestrator/packages/core/src/verdict.ts:1-50` (JSON-fence extraction).
**Interfaces produced:**
- `Action = { kind:"work"|"advance"|"respawn"|"promote"|"reclaim"|"escalate"|"noop"; role?:string; to?:string; reason?:string; dispatch?:{role,epoch,mode:"judgement"|"mechanical",respawn:boolean} }` (superset of plugin `decide.mjs:18-19` Action + orchestrator `Decision.dispatch`).
- `Verdict` = the 9-member union verbatim from `orchestrator/packages/core/src/types.ts:71-80` (advance/reject/submitted/question/error/veto/hold/advice/clean).
- `Lifecycle = Record<string, StageDef>` where `StageDef = { owner: string; to: string | null; gate?: "mechanical" | "human" | "judgement" | "barrier"; advisors?: { role: string }[] }` — the routing config (gate KIND + advisor role) that `GET /config`'s `BoardMachine` omits. `TeamPolicy = { advisors: {role:string}[] }`.
- Re-export `EnrichedItem`, `ItemSnapshot`, `ActInput`, `BoardMachine`, `NextTransition` from `@yarradev/shared`.
- [ ] **Step 1 — failing test** `verdict.test.ts`: assert `parseVerdict('...```json\\n{"status":"advance","to":"test"}\\n```')` → `{status:"advance",to:"test"}`; malformed → `{status:"error",...}`. (Port the orchestrator repo's verdict tests.)
- [ ] **Step 2 — run FAIL** → **Step 3 — implement** types + `parseVerdict` → **Step 4 — PASS** + typecheck → **Step 5 — commit** (`feat(core): Verdict/Action types + parseVerdict`).

### Task 3: `boardClient` — one typed HTTP client
**Files:** Create `src/boardClient.ts`; Test: `test/boardClient.test.ts` (inject a fake `fetch`). Union of `orchestrator/packages/core/src/client.ts` (list/read/submitActs) + plugin `lib.mjs` (per-verb helpers) + the MISSING helpers.
**Interfaces produced — `class BoardClient`** (`opts:{apiBase,doName,token,role?,fetch?}`):
- Reads: `listCards(opts?):Promise<ItemSnapshot[]>` (GET `/cards`), `getEnriched(id):Promise<EnrichedItem|null>` (GET `/cards/:id/enriched`), `getMachine():Promise<BoardMachine|null>` (GET `/config`), `acts(after?,limit?)` (GET `/acts`).
- Write core: `submit(acts:ActInput[]):Promise<AppendResult[]>` (POST `/batch`), `act(a:ActInput):Promise<AppendResult>` (POST `/acts`).
- Act helpers (thin wrappers over `act`): `claim/move/reject/linkPr/push/veto/hold/clear/clearVeto/ask/answer/humanGo/escalate/clearHold`. **NB:** `getEnriched`, `acts` (history), `submit` (batch), `answer`, generic `ask`, and **`clearHold`** are the gaps the survey found (missing in both `lib.mjs` and `@yarradev/board-client`) — add them here. Identity is server-set from the bearer; never sent in the body.
- [ ] **Step 1 — failing test**: with a fake `fetch` asserting method+path+body, verify each read hits the right route (per `workers/api/src/index.ts:339-373`) and each act helper posts the right `{type,item_id,gen,data}`; assert `clearHold` posts `{type:"CLEAR"}` (the board's hold-clear) and `getEnriched` GETs `/cards/:id/enriched`.
- [ ] **Step 2 — FAIL** → **3 — implement** → **4 — PASS** + typecheck → **5 — commit** (`feat(core): one typed BoardClient (reads + all act helpers incl clearHold)`).

### Task 4: `decide()` — retarget to `EnrichedItem`, all branches + promote/human  *(the crux — split if needed)*
**Files:** Create `src/decide.ts`, `src/config.ts` (lifecycle helpers); Test: `test/decide.test.ts`, `test/decide-corpus.test.ts` + `test/fixtures/cases.json` (ported from v1 per D2) + `test/fixtures/lifecycle.ts`. Port branch semantics from `orchestrator/packages/core/src/decide.ts:120-193` and the plugin `decide.mjs:31-71`; **re-target every field access from `CanonicalCard` to `EnrichedItem`** per the mapping below.
**Interface produced:** `decide(card:EnrichedItem, lifecycle:Lifecycle, policy:TeamPolicy, nowMs:number): Action`. (`lifecycle` gives gate KIND + advisor role; `card.next_transitions` gives the board's per-edge gate verdicts. `BoardMachine` from `GET /config` is used only by Task 8's coherence check, not by `decide`.)

**CanonicalCard → EnrichedItem field mapping (the real work):**
| decide reads (CanonicalCard) | EnrichedItem source |
|---|---|
| `c.stage` | `card.state` |
| `c.state==="closed"` (terminal) | `machine.terminal.includes(card.state)` |
| `c.overlays` includes `blocked` | `card.blocked` |
| `c.overlays` includes `veto-held` | `card.veto_held` |
| `c.overlays` includes `hold-open` | `card.hold_open` |
| `c.overlays` includes `escalated` | `card.escalated` |
| `c.lease` (active?) | `card.lease_expiry_ts != null && card.lease_expiry_ts > nowMs` |
| `c.checks.ci` | `card.ci_rollup` |
| `c.pr` | `card.linked_head_sha` (present ⇒ PR linked) |
| `c.advisors` (ever-vetoed, for board-drift) | `card.vetoes[]` / `card.holds[]` (roles) |
| `c.counters.transitions` | `card.transitions_count` |
| `c.counters.bounces[edge]` | *(not on EnrichedItem — bounce budget is board-enforced via `within_budget`; decide keeps the transition-budget backstop only; document that per-edge bounce escalate is delegated to the board)* |
| `c.questions.open` / `.blocking` | `card.open_questions[]` (+ `deadline_ts`) |
| `c.children.total/.done` (fan-in) | `card.children_total` / `card.children_done` |
| `c.epoch` | `card.current_gen` |
| `c.malformed` | *(board rejects malformed acts; decide's malformed→escalate guard drops unless a malformed signal exists on EnrichedItem — confirm/track)* |
| stage gate kind (`mechanical`/`human`/`barrier`/judgement) | `machine.transitions` for `from=card.state` — but `BoardMachine` omits gate exprs (`storage.ts:1560-1569`). **Lifecycle gate kind comes from the plugin `board.json` lifecycle** (`owner/to/gate`), passed alongside `machine`. See §D-note. |

**Branch precedence (target, from design §3.1 + orchestrator `decide.ts` order):** unknown-stage→escalate · terminal→noop · malformed→escalate · transition-budget→escalate · board-drift (`veto_held` with empty `vetoes[]`, or `blocked` with empty `open_questions[]`)→escalate · blocked (answer-pending/deadline→escalate/park)→noop · veto-held→park(noop) [clear delegated to human CLEAR_VETO; detect cleared→resume] · hold-open→park(noop) · open blocking question→route (work owner or escalate) · **epic fan-in barrier** (`children_total===0`→escalate / `children_done===children_total`→advance / else noop) · **human gate → promote** (NEW; `lifecycle[state].gate==="human"`) · **mechanical gate** (no `linked_head_sha`→work owner · `ci_rollup==="success"`: **advisor-dispatch check first** — if `next_transitions[to].failing` includes `"advisor_clear"` → `{kind:"work", role:<lifecycle[state].advisors[].role>}` (dispatch the advisor) else `advance` · `ci_rollup==="failure"`→respawn(time-window) · else pending/absent→noop) · lease active→noop / expired→reclaim · else→spawn(work) owner.

**Advisor-dispatch note (resolves the Phase-0 watch-item):** the target dispatches the advisor off the **board-computed** `next_transitions[to].failing.includes("advisor_clear")` (which `EnrichedItem` already exposes — `NextTransition{to,type,failing[],passing[]}`), NOT off `pr.changed_files`×`watch_paths`. So Phase 1 dispatches the advisor whenever the board says `advisor_clear` is unmet (conservative); the advisor returns `advice`/`clean` → `reduce` (Task 5, D4) emits an `ADVICE` act → the gate clears → next tick advances. **watch_paths *precision* (only dispatch when changed files match) stays Phase 2** (board-side `advisor_clear` computation + webhook changed-files). In the corpus translation, v1's `spawn-advisor` cases map to an `EnrichedItem` whose `next_transitions[to].failing=["advisor_clear"]`; the "advance (matched 0/2 files)" cases map to `failing` WITHOUT `advisor_clear`.

**D-note (lifecycle source):** `GET /config` returns `BoardMachine` *without* gate exprs; the plugin's `board.json` lifecycle carries `gate: mechanical|human|judgement` + `advisors[]`. Task 8 single-sources this; for Task 4, `decide` takes the plugin lifecycle (`Record<state,{owner,to,gate?,advisors?}>`) as one arg AND the `EnrichedItem` (which carries `next_transitions` from the live board) — the lifecycle gives gate KIND + advisor role, the item gives the board's gate verdicts. Task 8 reconciles the lifecycle against `GET /config` states/edges.

- [ ] **Step 1 — translation layer + failing corpus test:** copy `orchestrator/docs/phase1-oracle/v1-cases.json` → `test/fixtures/cases.json`. Write `test/fixtures/translate.ts`: `v1CaseToEnriched(case): {card:EnrichedItem, lifecycle, now}` (map `stage→state`, `overlays.{blocked,veto_held}→blocked/veto_held`, `current_epoch→current_gen`, `lease.active/expiry→lease_expiry_ts`, `checks.ci_green→ci_rollup`, `pr.linked→linked_head_sha`, `advisors.<role>.veto_open→vetoes[]`, `counters.transitions→transitions_count`, `completion.terminal→machine.terminal`; for `spawn-advisor` cases set `next_transitions[to].failing=["advisor_clear"]`, for non-watched advance clear it) and `v1ActionToCore(_expect): Action`. `test/decide-corpus.test.ts`: for each case where `!case._deferred`, assert `decide(v1CaseToEnriched(case)) ⇒ v1ActionToCore(case._expect)`; assert the 2 `risk-gate` cases are tagged `_deferred` and skipped-with-log.
- [ ] **Step 1b — failing unit tests** `decide.test.ts`: port the plugin `decide.test.mjs` scenarios re-expressed over `EnrichedItem` (judgement default, mechanical ci/lease precedence, budgets, veto/hold park, board-drift escalate, fan-in barrier, terminal, backlog routing) + a NEW **human-gate→promote** test + a NEW **advisor-dispatch** test (`ci_rollup:"success"` + `next_transitions[test].failing:["advisor_clear"]` ⇒ `{kind:"work",role:"security-advisor"}`).
- [ ] **Step 1c — differential-parity test** `test/parity-plugin.test.ts`: import the CURRENT plugin `decide` (from `../../../../yarradev-board/skills/yarradev-board-run/scripts/decide.mjs` — a git sibling; if unavailable in CI, gate behind an env flag + record) and, over a generated matrix of `EnrichedItem`s spanning every branch, assert the new core `decide` agrees with the plugin `decide` on the routing kind for every non-advisor/non-promote case (the plugin lacks those branches — exclude them). This pins "no regression vs the shipped runtime."
- [ ] **Step 2 — run, expect FAIL** (`decide`/translation not implemented).
- [ ] **Step 3 — implement** `decide` per the mapping + precedence + advisor-dispatch; `config.ts` lifecycle typing (`{owner,to,gate?,advisors?}`).
- [ ] **Step 4 — run, expect PASS** — in-scope corpus green (≈62/64, 2 risk-gate deferred), unit tests green, differential-parity green.
- [ ] **Step 5 — commit** (`feat(core): decide() EnrichedItem-native — branches + promote/human + advisor-dispatch; v1 corpus green`).

**Split guidance:** if the diff is large, split into 4a (core routing + corpus minus advisor) and 4b (advisor-dispatch + fan-in barrier + differential-parity).

### Task 5: `reduce()` — verdict → `ActInput[]`
**Files:** Create `src/reduce.ts`; Test: `test/reduce.test.ts`. Port mapping from `orchestrator/packages/core/src/reduce.ts:9-56`, but emit board `ActInput[]` (D3) and route advice/clean → `ADVICE` (D4).
**Interface produced:** `reduce(verdict:Verdict, card:EnrichedItem, lifecycle:Lifecycle): ActInput[]`.
- Mapping: `advance`→`[MOVE]` (validate forward edge exists, else `[ESCALATE]`); `reject`→`[REJECT]` (validate backward edge); `submitted`→`[LINK_PR]` if no `linked_head_sha` else `[PUSH]`; `question`→`[ASK]`; `error`→`[ESCALATE]`; `veto`→`[VETO{reviewed_head}]`; `hold`→`[HOLD{reviewed_head}]`; **`advice`/`clean`→`[ADVICE{reviewed_head}]`** (the P0-1 clean-review act — closes the operational watch-item). CLEAR_LEASE is posted by the conductor, not reduce (matches SKILL.md).
- [ ] **Step 1 — failing test** asserting each verdict → the exact `ActInput[]` (type/data), incl. `advice`/`clean`→`ADVICE{data:{reviewed_head:v.head}}` and edge-validation escalate paths.
- [ ] **Step 2 — FAIL** → **3 — implement** (exhaustive switch + `never` guard) → **4 — PASS** → **5 — commit** (`feat(core): reduce() verdict→ActInput[] (advice/clean→ADVICE)`).

### Task 6: Build + bundle + CI drift guard
**Files:** Modify `orchestrator-core/package.json` (`build` script); Create `yarradev-board/skills/yarradev-board-run/scripts/vendor/core.mjs` (build output, committed); Modify `yarradev-board/.github/workflows/ci.yml` (rebuild+diff guard); Test: a build-determinism check.
- [ ] **Step 1 — failing check:** a script `scripts/check-vendored-core.sh` (in platform) that runs `esbuild src/index.ts --bundle --format=esm --platform=node --outfile=<tmp>` and `diff <tmp> ../../yarradev-board/.../vendor/core.mjs`; assert it fails when the committed bundle is stale.
- [ ] **Step 2 — run FAIL** (no bundle yet) → **Step 3 — implement the guard (concrete cross-repo mechanism):**
  - `build` script in `orchestrator-core/package.json`: `esbuild src/index.ts --bundle --format=esm --platform=node --outfile=<plugin>/skills/yarradev-board-run/scripts/vendor/core.mjs --banner:js='// GENERATED from @yarradev/orchestrator-core — do not edit; run `pnpm --filter @yarradev/orchestrator-core build`'`. Run it once to emit + commit `vendor/core.mjs` (in the plugin repo).
  - **Platform-side guard** (authoritative — where the source lives): add `check-vendored-core` to platform CI (extend `likec4.yml` or a new `core.yml`) that rebuilds to a temp file and `diff`s against the sibling checkout's committed `vendor/core.mjs`; **fail on drift**. In CI the plugin repo is checked out alongside (add an `actions/checkout` of `yarradev/yarradev-board` into a subdir) so the diff target exists. This is the real "vendored matches tsc/esbuild output" guard.
  - **Plugin-side guard** (defense-in-depth — the plugin CI can't rebuild without the core source): commit `vendor/core.mjs.sha256` next to the bundle; add a step to the plugin's `ci.yml` asserting `shasum -a 256 -c vendor/core.mjs.sha256`. This catches a hand-edited/corrupted vendored bundle even though it can't detect source drift (the platform guard does that).
- [ ] **Step 4 — run PASS** (bundle matches) → **Step 5 — commit** both repos (`build(core): esbuild bundle → plugin vendor/core.mjs + drift guard`).

### Task 7: Plugin integration — delete `decide.mjs`/`lib.mjs`, repoint to vendored core
**Files:** Delete `yarradev-board/skills/yarradev-board-run/scripts/{decide.mjs,lib.mjs}`; Modify the 16 CLI scripts + `list-ready.mjs` to import `BoardClient`/`decide` from `./vendor/core.mjs`; keep `config-trust.mjs`; Modify `test/{decide,board-io,token}.test.mjs` to import from the vendored core.
- [ ] **Step 1:** repoint `list-ready.mjs` (uses `decide`) + each CLI wrapper (uses `BoardClient`) to `vendor/core.mjs`; delete `decide.mjs`+`lib.mjs`.
- [ ] **Step 2 — run plugin suite** `node --test` — port `decide.test.mjs` assertions to the core's behavior (should already match — the core is a superset); `token.test.mjs`/`board-io.test.mjs` import the client from the vendor bundle. Expect GREEN (15+ tests) with no `lib.mjs`/`decide.mjs` remaining.
- [ ] **Step 3 — verify** `grep -r "lib.mjs\|decide.mjs" skills/ test/` returns only the vendored core / historical refs; conductor SKILL.md still drives correctly.
- [ ] **Step 4 — commit** (`refactor(plugin): drive from vendored orchestrator-core; delete hand-rolled decide.mjs+lib.mjs`).

### Task 8: Single-source the lifecycle (coherence check vs `GET /config`)
**Files:** Modify `orchestrator-core/src/config.ts` (+ `boardClient.getMachine`); Modify plugin `list-ready.mjs`/conductor to run a startup coherence check; Test: `test/config-coherence.test.ts`.
- [ ] **Step 1 — failing test:** given a plugin `board.json` lifecycle whose states/edges disagree with a `BoardMachine` from `GET /config` (e.g. missing `backlog`), `assertLifecycleCoherent(lifecycle, machine)` throws with a precise diff; when they agree, it passes.
- [ ] **Step 2 — FAIL** → **Step 3 — implement** `assertLifecycleCoherent` (states set-equal, every lifecycle `to` edge present in `machine.transitions`); wire it into the conductor's first pass (fail-closed: refuse to route on incoherence). Confirm the plugin `board.example.json` 7-state lifecycle matches the live `acme:main` machine.
- [ ] **Step 4 — PASS** → **Step 5 — commit** (`feat: single-source lifecycle — startup coherence check vs GET /config`).

### Task 9: Retire `platform/orchestrator/` → `platform/examples/board-smoke/`
**Files:** Delete `platform/orchestrator/`; Create `platform/examples/board-smoke/{package.json,src/smoke.ts,test/smoke.test.ts}`; Modify `platform/pnpm-workspace.yaml` (replace `orchestrator` with `examples/*`).
- [ ] **Step 1 — failing test:** `examples/board-smoke` — an LLM-free contract test that (against a booted board via the vitest DO harness OR an opt-in live board) exercises the real HTTP surface: CREATE→CLAIM→LINK_PR→INGEST_FACT→MOVE→gate behavior, using `orchestrator-core`'s `BoardClient` + `EnrichedItem`/`BoardMachine` — proving the board API is drivable by the core. (Reuse the assertions from the old `orchestrator/test/orchestrator.test.ts` but against the real client/types, not `FakeBoard`.)
- [ ] **Step 2 — FAIL** (no example yet) → **Step 3 — implement** the smoke contract test + remove `platform/orchestrator/` + workspace entry; `pnpm install` re-links.
- [ ] **Step 4 — run** `pnpm -r test` — `@yarradev/orchestrator` gone, `board-smoke` green, nothing else references the old package (survey confirmed zero consumers).
- [ ] **Step 5 — commit** (`refactor: retire platform/orchestrator → examples/board-smoke contract test`).

---

## Phase 1 acceptance gate
- [ ] ONE `decide` — the plugin has no `lib.mjs`/hand-`decide.mjs`; `list-ready` + CLI wrappers import the vendored core; `grep` confirms.
- [ ] `orchestrator-core` suite green incl. the ported v1 `cases.json` corpus (behavioral parity); vendored `.mjs` matches `tsc`/esbuild output (CI drift guard green).
- [ ] All platform suites (`pnpm -r test`) + plugin `node --test` green; `pnpm -r typecheck` clean; LikeC4 drift-check green.
- [ ] **LikeC4 model flip (target model already merged — commit 4caed9e):** as `orchestrator-core` + `examples/board-smoke` land, flip `platform.orchestratorCore` (+ `coreDecide/coreReduce/coreClient/coreVerdict/coreConfig`), `platform.boardSmoke`, and `runner.vendoredCore` from `#planned`→`#built` and swap their GitHub URL links for relative links (`packages/orchestrator-core/src/…`, `examples/board-smoke/…`); flip `runner.roles.roleAnalyst` only when Phase 2 ships it. Re-run `node scripts/likec4-check.mjs` (relative links are now existence-checked).
- [ ] `examples/board-smoke` passes (board API drivable by the core, LLM-free).
- [ ] Dogfood: the plugin drives a card `backlog→…→prod` on `acme:main` end-to-end (or the board-smoke contract stands in, with the live dogfood recorded).
- [ ] (AMBER) PR per repo; CI green → merge; deploy if prod code shipped (core is client-side — likely no board deploy, but re-verify).
- [ ] RUN-LOG updated with commit SHAs.

## Self-review
- **Spec coverage:** every Phase-1 runbook checklist item maps to a task — extract core (T1–T5), one boardClient (T3), promote/human backport (T4), build+bundle+guard (T6), generate/replace plugin decide.mjs+lib.mjs (T7), retire stub→board-smoke (T9), single-source lifecycle (T8). ✓
- **Deletions:** backend seam / adaptors / factory / CanonicalCard / neutral Op are dropped by *not carrying them into core* (the orchestrator repo is archived in Phase 3), not by editing a repo we're about to archive. ✓
- **No placeholders** except the explicitly-flagged DECISIONS (§0) and the two tracked field-mapping gaps (per-edge bounce → delegated to board `within_budget`; `malformed` signal on EnrichedItem) — called out, not hidden. ✓
- **Types consistent:** `Action`/`Verdict`/`ActInput`/`EnrichedItem`/`BoardMachine` names are used identically across T2/T3/T4/T5. ✓
- **Risk:** Task 4 (decide retarget) is the crux — the v1 `cases.json` corpus is the guardrail; if D2's clone is blocked, parity assurance weakens (recorded). Consider splitting T4 into 4a (branches) / 4b (fan-in + promote) at execution if the diff is large.
