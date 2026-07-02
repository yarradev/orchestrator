# Unification Phase 2b — Epic tier + authenticated advisor precision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. TDD throughout — failing test first, minimal impl, green, commit. Checkbox (`- [ ]`) steps. Obey the MASTER runbook Autonomy Contract (§1). §0 decisions are RESOLVED (user-confirmed 2026-07-02) — execute directly.

**Goal:** Ship v1's two proven remaining behaviors on the platform substrate — the epic/analyst two-tier (4-stage epic lifecycle with a CLAIM-free fan-in barrier and an analyst role that decomposes epics into child stories) and watch_paths-precise advisor dispatch sourced from the **HMAC-authenticated push webhook** (fail-safe on any uncertainty) — plus the thin fast-lane CREATE surface.

**Architecture:** The board (Cloudflare DO) owns gate *enforcement* and now also owns the authenticated changed-files knowledge (a `push_chain` fold keyed by repo+branch, joined to cards by head sha); `orchestrator-core` routes (barrier leg becomes promote-shaped); the plugin conductor dispatches the new `analyst` persona and posts CREATE acts. The security-advisor's self-diff REMAINS the verdict authority — narrowing only decides whether to *dispatch* it, and every unknown fails safe (dispatch).

**Tech stack:** TypeScript (strict, ESNext), vitest (board/shared/core), `node:test` (plugin), esbuild (vendored bundle), Cloudflare Workers/DO/D1/Queues, pnpm workspaces, GitHub Actions CI.

## Global constraints (apply to every task)
- **The board owns server-enforced gates; the plugin/core never bypass them.** Port what v1 PROVED (4-stage epic, thin lanes), not its vision (the 7-stage epic tier is explicitly out of scope).
- **Keyless + trust model:** the plugin/core never hold an LLM key or GitHub token; `workers/webhook/src/outbound.ts` STAYS SEALED (candidate-(a) App-token infra is NOT built in 2b). A veto-authority decision is NEVER sourced from a reviewee/prompt-injectable subagent — changed-files knowledge comes ONLY from HMAC-verified push webhooks, and **any uncertainty ⇒ the advisor is dispatched** (fail-safe = today's behavior).
- **Additive, guarded migrations only** (`_migrations` pattern); no destructive schema changes. Keep every suite green (board/api/shared/dashboard/mcp/webhook/orchestrator-core/board-smoke + plugin `node:test`) + `pnpm -r typecheck` + all four CI guards (vendored-core, config-hash, watch-paths, no-cheap-model) + LikeC4 drift-check.
- **Any core change ⇒ rebuild the vendored `.mjs`** (`pnpm --filter @yarradev/orchestrator-core build`) + update plugin `vendor/core.mjs` + sha256 + `platform/scripts/check-vendored-core.sh` GREEN.
- **Any config change ⇒ `scripts/check-config-hash.sh --write`** + commit the regenerated snapshot, AND (acceptance gate, AMBER) re-apply to live `acme:main` with a rollback ref first.
- **Cross-repo merge order:** plugin PR merges before/with the platform PR (platform `core.yml` diffs the bundle against the plugin default branch).
- **Cite `path:line`; TDD, DRY, YAGNI, frequent commits.** Every agent `.md` MUST declare `model:` + `authority:` frontmatter (plugin CI guard `no-cheap-model-on-veto.test.mjs:63-71` fails closed without them).

---

## 0. DECISIONS (RESOLVED — user-confirmed 2026-07-02)

- [x] **D1 — Changed-files source = push webhook, fail-safe.** HMAC-verified (`verify.ts:17`) push payloads carry `commits[].added/modified/removed`; GitHub truncates (`commits[]` at 20/push, files at 3000/commit), so completeness is tracked explicitly via the **branch-chain rule** (T3). Candidate (a) (unseal outbound, `GET /pulls/{n}/files`) REJECTED for 2b: `outbound.ts:1-8` is a 3-line always-throw stub — greenfield App-token infra (JWT/RS256, new PEM secrets, unverifiable App permissions) the repo itself defers to Phase 5. "Authenticated" here = GitHub-origin HMAC-signed payload; never the reviewee agent.
- [x] **D2 — Content scanners DEFERRED entirely.** v1 shipped all 3 scanners `enabled:false` and labeled them "planned (phase 6)" (`yarradev-tbd/checks/README.md:9-21`) — they were never proven live, failing the port bar. The OR-backstop design notes (`v1-eval-gates.js:283-306`) are preserved in the Deferred section.
- [x] **D3 — Fast-lane = thin.** v1's proven form was "which stage a card starts at" (`yanyja lifecycle.overrides.yaml` `lanes: {fast: dev, full: spec}`) with zero engine logic. 2b ships `create.mjs --lane` + a cockpit lane option; NO `RawConfig.lanes` schema block, no CREATE entry-state allow-list.
- [x] **D4 — Bulk reconcile DEFERRED to Phase 3.** No v1 engine primitive existed (single-card tick loop; the "27-card bulk fix" is an uncorroborated operator anecdote). The portable pin-re-sync idea is recorded in Deferred.
- [x] **D5 — Barrier fix = promote-shaped.** decide's barrier-advance (`decide.ts:79-85`) returns role-less `{kind:"advance"}`, and the conductor's `advance` branch CLAIMs with the line's role (`SKILL.md:78-83`) → `claim.mjs:16-19` exits 2 → a completed epic stalls silently. Fix: the barrier leg returns `{kind:"promote", to, reason}` (mirrors the human-gate leg, `decide.ts:89`); `promote.mjs` gains an optional `[role]` arg (default `"releaser"`, backward compatible) so the barrier MOVE posts under `analyst` (no orchestrator cap-widening). The 2a tripwire test (`decide.test.ts:88` exact `.toEqual`) is EXPECTED to change — it was tightened precisely to force this.
- [x] **D6 — Epic states are `epic_`-prefixed.** `decide()` takes ONE flat lifecycle keyed by bare state name (no `card.type` dispatch — `list-ready.mjs:71`), and v1's epic stage `done` collides with the story `done`. Merged machine gains `epic_analysis → epic_decompose → epic_integrating → epic_done` (terminal). `item.type` ("epic"/"story", `storage.ts:681`) stays metadata; routing is by state name.
- [x] **D7 — Epic config IS applied to live acme:main at the acceptance gate** (AMBER, additive state keys, rollback ref first).

## Scope map
| Task | Item | Provenance | Blast radius |
|---|---|---|---|
| 1 | Port v1 glob matcher to `packages/shared` | v1-eval-gates.js:75-92 (verbatim) | shared |
| 2 | Webhook `push` extraction → `push_files` fact | D1; survey-1 | webhook |
| 3 | Board `push_chain` fold + completeness rule | D1; survey-1/2 | board (schema v8) |
| 4 | watch_paths narrowing in `buildGateInputs` | P1 "advisor precision"; 2a-deferred | board + shared |
| 5 | Barrier promote-shaped + `promote.mjs [role]` | D5; 2a post-merge review LATENT | core + plugin (bundle) |
| 6 | CREATE plumbing: `create()`, `decomposed` verdict, `create.mjs` | P1-5; survey-3 §4 | core + plugin (bundle) |
| 7 | `analyst.md` persona + conductor wiring | P1-5 | plugin |
| 8 | Epic lifecycle config (live) + fast-lane surface | P1-5, P1-6, D6, D3 | platform config + plugin config + dashboard |
| gate | Suites + review + AMBER merge/deploy/config-apply + LikeC4 | — | both repos + prod |

**Removed from 2b (→ Deferred):** content scanners (D2); bulk reconcile/pin re-sync (D4); outbound GitHub App client (Phase 5); the 7-stage epic vision (never port); risk-tier gating, `thread_budget` (standing defers).

---

## Target file structure (touch map)
**platform/packages/shared/src/** — `watch-match.ts` (new: `globToRegExp`, `watchMatch`) [T1]; `types.ts` `DerivedJson.changed_files?` — NO, changed-files state lives in the new `push_chain` table, not derived_json [T3]; `gates.ts` UNCHANGED (narrowing happens in `buildGateInputs`'s `required` calc, `AdvisorInput.required` stays a plain boolean).
**platform/workers/webhook/src/** — `extract.ts` add a `push` branch emitting `PushFilesFact` [T2]; `route.ts` `toIngestArg` passes it through [T2].
**platform/workers/board/src/** — `schema.ts` guarded additive `push_chain` table (migration v8) [T3]; `storage.ts` `GitHubFact` union += `push_files`, `ingestFactSync` chain fold [T3], `buildGateInputs` advisor `required` narrowing (~:384-406) [T4].
**platform/packages/orchestrator-core/src/** — `decide.ts` barrier advance→promote + `role: st.promoteAs` on both promote legs [T5]; `types.ts` `StageDef.promoteAs?` [T5] + `Verdict` += `decomposed` [T6]; `reduce.ts` `decomposed` case (non-runtime symmetry) [T6]; `boardClient.ts` `create()` helper [T6]. (No `config.ts` change — the gate-kind coherence check was dropped, → Deferred.)
**platform/scripts/configs/** — `acme-main-v2.json` epic states/transitions/caps + snapshot `--write` [T8].
**platform/dashboard/src/** — cockpit fast-lane create option (`cockpit-render.ts:100` second form target) [T8].
**yarradev-board/** — `scripts/promote.mjs` optional role [T5]; `scripts/create.mjs` (new) [T6]; `agents/analyst.md` (new) [T7]; `SKILL.md` (barrier gate-tag ¶, analyst token row, `decomposed` verdict branch, promote role note) [T5/T6/T7]; `config/board.json`+`board.example.json` epic keys [T8]; `test/config-coherence.test.mjs:32` 7-key pin → 11-key [T8]; `scripts/vendor/core.mjs` rebuilt [T5/T6/T8].

---

## Tasks

### Task 1: Port the v1 glob matcher to `packages/shared` (verbatim semantics)
**Files:** Create `platform/packages/shared/src/watch-match.ts`; Test `platform/packages/shared/test/watch-match.test.ts`.
**Interfaces produced:** `globToRegExp(glob: string): RegExp` · `watchMatch(files: string[] | undefined, patterns: string[] | undefined): boolean` — exported from the shared package (submodule import path `@yarradev/shared/watch-match`, same pattern as `@yarradev/shared/budgets` from 2a T4 — do NOT fatten the barrel).
**Port source (verbatim semantics — `v1-eval-gates.js:75-92`):** case-INSENSITIVE (`'i'` flag — "PaymentService.java must not be missed"); `**`(`/`?) → `.*`; bare `*` → `[^/]*`; `?` → `[^/]`; regex metachars escaped; anchored `^…$`; NO brace-expansion/char-classes; dotfiles need no special handling (leading `.` is a literal — `**/.env*` matches `.env`).
```ts
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$", "i");
}
export function watchMatch(files: string[] | undefined, patterns: string[] | undefined): boolean {
  if (!files || !files.length || !patterns || !patterns.length) return false;
  const res = patterns.map(globToRegExp);
  return files.some((f) => res.some((r) => r.test(f)));
}
```
- [ ] **Step 1 — failing tests:** `src/**` matches `src/a.ts` not `test/a.ts`; `**/*.ts` crosses dirs; `src/*.ts` does NOT match `src/a/b.ts` (single segment); `?` single char; case-insensitivity (`workers/**` matches `Workers/Auth.TS`); dotfile (`**/.env*` matches `.env`, `config/.env.prod`); metachar escaping (`a+b/*.ts` literal `+`); empty files / empty patterns → `false`.
- [ ] **Step 2 — FAIL → Step 3 — implement (code above) → Step 4 — PASS** + typecheck. **Step 5 — commit** (`feat(shared): port v1 watch_paths glob matcher (case-insensitive, ** crossing)`).

### Task 2: Webhook — extract `push` events into a `push_files` fact
**Why:** `extract.ts` has NO `push` branch (falls to `null` at `:174`) — the authenticated file lists GitHub already sends are parsed and discarded (`index.ts:51-56`).
**Files:** Modify `platform/workers/webhook/src/extract.ts` (+ its fact union `:17-55`), `route.ts` `toIngestArg` (`:48-61`). Test `workers/webhook/test/`.
**Interface produced:** `PushFilesFact = { kind:"push_files"; installation_id:number; repo:string; branch:string; before:string; after:string; created:boolean; forced:boolean; truncated:boolean; head_reached:boolean; files:string[] }` (`head_reached` = the push's `commits[]` contains a commit `id === after`; distinguishes a real content push from a pointer-move to a pre-existing commit — load-bearing for T3's completeness rule).
**Extraction rules (fail-closed like every other event, `extract.ts:85-87`):** require `installation.id` + `repository.full_name` else `null`. `branch` = `ref` stripped of `refs/heads/` (non-branch refs → `null` — ignore tag pushes). `deleted:true` pushes → `null`. `files` = de-duplicated union of `commits[].added ∪ modified ∪ removed`. `head_commit` = `payload.head_commit?.id ?? null`. `truncated` = `payload.commits.length >= 20` (⚠️ the GitHub **push webhook** payload has NO reliable `size`/count field — that lives only on the Events-API `PushEvent`; GitHub caps the webhook `commits[]` array at 20, so `>= 20` is the conservative truncation signal — NEVER compare against a `payload.size` that doesn't exist) OR `files.length > 3000` (cap the stored union; storage defense). `created` = `payload.created`; `forced` = `payload.forced`. `head_reached` = whether `commits[]` actually contains a commit whose `id === after` (i.e. this push introduced its own tip) — carried so T3 can distinguish a real content push from a branch-pointer move; compute `head_reached = commits.some(c => c.id === after)`.
- [ ] **Step 1 — failing tests:** a 2-commit push → fact with unioned files, `truncated:false`, `head_reached:true`; a push with `commits.length === 20` → `truncated:true`; a created push pointing at a pre-existing commit (`commits:[]`, `after` set) → `head_reached:false`; `created`/`forced` flags pass through; tag push (`refs/tags/v1`) → `null`; `deleted:true` → `null`; missing `installation.id` → `null`. **Assert the fact shape carries NO `size` field and truncation is derived purely from `commits.length` (a payload with no `size` still yields the right `truncated` for a <20-commit push).**
- [ ] **Step 2 — FAIL → Step 3 — implement** (new `case "push":` in `extractFact`, `route.ts` passthrough) → **Step 4 — PASS** + typecheck + webhook suite. **Step 5 — commit** (`feat(webhook): extract push events into an authenticated push_files fact`).

### Task 3: Board — `push_chain` fold with the branch-chain completeness rule
**Why:** per-push file lists ≠ the PR's full changed set. Skipping a VETO-authority advisor is only safe when the board PROVABLY saw the branch's whole history. This task owns that proof.
**Files:** Modify `platform/workers/board/src/schema.ts` (guarded additive migration v8: table `push_chain`), `storage.ts` (`GitHubFact` union `:1176-1180` += the `push_files` member mirroring T2's shape — the unions are deliberately mirrored, no cross-import, per `storage.ts:1172-1175`; new `ingestFactSync` case `~:1281ff`). Test `workers/board/test/push-chain.test.ts` (through the real `ingestFact` fold, like `enriched-read.test.ts` does).
**Schema:** `CREATE TABLE push_chain (repo TEXT NOT NULL, branch TEXT NOT NULL, head_sha TEXT NOT NULL, files_json TEXT NOT NULL DEFAULT '[]', complete INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL, PRIMARY KEY (repo, branch))` + index on `head_sha`. `_migrations`-guarded + `PRAGMA table_info` self-heal, exactly the 2a v7 pattern (`schema.ts:367-383`).
**🔑 The branch-chain completeness rule (the security core of D1 — implement EXACTLY).** ⚠️ THREAT MODEL: the developer agent controls git on the feature branch (can force-push, split pushes, create branches at arbitrary commits) but cannot forge webhook HMAC or exceed board caps. `complete=1` must mean "the board observed, via authenticated pushes, every commit that introduces the branch's current content, starting from a push that actually introduced its own tip." A `complete=1` with an under-reported file set is a P0-1 hole (skips the veto advisor). For an incoming `push_files` fact on `(repo, branch)` with existing row `prev` (or none):
1. **`created:true` (branch-creation push): NEW chain.** `files = fact.files`; `complete = fact.head_reached && !fact.truncated && !fact.forced`. **The `head_reached` clause is the fix for the adversarial finding:** a branch created pointing at a *pre-existing* commit arrives with `commits:[]` (GitHub omits already-present commits) → `head_reached=false` → `complete=0`, so it can never be used to skip the advisor with an empty/under-reported file set. Only a created push that genuinely introduces its own tip commit(s) is trusted.
2. **else if `prev` exists AND `fact.before === prev.head_sha` (gapless extension):** `files = prev.files ∪ fact.files`; `complete = prev.complete && fact.head_reached && !fact.truncated && !fact.forced`.
3. **else (no prev / `before` mismatch = gap / anything unexpected):** `files = prev.files ∪ fact.files` (telemetry only), `complete = 0`.
Always: `head_sha = fact.after`, `updated_ts = now`. If the union exceeds 3000 files → `complete = 0` (bound growth; keep at most the first 3000 sorted-unique entries). `forced` and `!head_reached` NEVER yield complete (history rewritten / pointer-move = unknowable content).
**Fundamental-limitation note (put in a code comment):** push-chain completeness proves "content since our first observed introducing-push on this branch key" — it does NOT prove "the full PR-vs-merge-base diff" in the general case (a branch can be cut from an arbitrary base). This is why narrowing is a best-effort cost optimization whose ONLY failure mode is over-dispatch (T4 fails safe on every uncertainty), NOT a security boundary — the advisor's self-diff remains the boundary. The exact PR-vs-base source (`GET /pulls/{n}/files`) is candidate (a), deferred to Phase 5.
- [ ] **Step 1 — failing tests (real fold):** created-push that introduces its tip (`head_reached:true`) → complete=1 with files; **created-push at a pre-existing commit (`head_reached:false`, `commits:[]`) → complete=0 even though not truncated/forced (the adversarial case — assert explicitly)**; second push chaining `before==head` with `head_reached` → union, still complete; a chaining push with `head_reached:false` → complete=0; gap push (`before` ≠ head) → complete=0 (sticky: a later chaining push keeps complete=0 — completeness NEVER recovers except via a fresh introducing `created` push); `forced` → complete=0; truncated → complete=0; tag/other repos isolated by PK.
- [ ] **Step 2 — FAIL → Step 3 — implement → Step 4 — PASS** + typecheck + full board suite. **Step 5 — commit** (`feat(board): push_chain fold — authenticated changed-files with branch-chain completeness`).

### Task 4: watch_paths narrowing in `buildGateInputs` (fail-safe)
**Why:** `AdvisorCfg.watch_paths` round-trips config/DB but is never read (`storage.ts:333-338`; comment `:916` "Interim scope: any advisor stage, not watch_paths"). This is the P0-1-safe narrowing: it only decides whether the advisor is *required*; the advisor's self-diff verdict stays authoritative; every unknown dispatches.
**Files:** Modify `platform/workers/board/src/storage.ts` `buildGateInputs` advisor map (`~:384-406`); import `watchMatch` from `@yarradev/shared/watch-match` [T1]. Test `workers/board/test/` (extend the gate-inputs tests).
**The narrowing rule (implement EXACTLY — every leg that can't PROVE irrelevance keeps `required` true):**
```
baseRequired = (a.joins_at ?? []).includes(state)          // unchanged, state-based
if (!baseRequired) required = false
else if (!a.watch_paths || a.watch_paths.length === 0) required = true   // no globs configured → current behavior
else if (item.linked_head_sha == null) required = true     // no PR head yet → fail safe
else {
  rows = push_chain rows WHERE repo == item's repo AND head_sha == item.linked_head_sha   // repo-scoped
  if (rows.length !== 1)         required = true   // 0 rows = no knowledge; >1 = ambiguous head shared across branches → fail safe (NEVER pick an arbitrary row)
  else if (!rows[0].complete)    required = true   // lossy/gapped/forced/pointer-move → fail safe
  else required = watchMatch(rows[0].files, a.watch_paths)   // ONLY exactly-one provable-complete row + zero match skips
}
```
(The `rows.length !== 1` fail-safe closes the adversarial "two branches share head `C`" join-ambiguity: the malicious empty-file row and a benign row both keyed on the same `head_sha` → ambiguous → advisor dispatched. The repo-scope closes the cross-repo variant. Item's repo comes from the `pr_link` join already used for head-freshness, `storage.ts:928`.)
`clear` calculation is UNTOUCHED — an already-open VETO/HOLD is honored regardless of current files (v1 parity, `v1-eval-gates.js:283-306`: "a later commit can drift below watch_paths — must not silently drop an open hold"; on this platform that's structural anyway since `veto_held`/`hold_open` park in `decide` before any gate read, `decide.ts:70-72`).
- [ ] **Step 1 — failing tests:** watched-state card with NO chain row → advisor required (unchanged behavior); TWO chain rows sharing the linked head_sha → advisor required (ambiguous join fail-safe); `linked_head_sha == null` → required; complete chain + a matching file (`src/auth/token.ts` vs `src/auth/**`) → required; exactly-one complete chain + zero matches → **not required** (`advisor_clear` passes vacuum-free because the advisor is simply not in the required set — assert `next_transitions` shows the gate passing); incomplete chain + zero matches → required (fail-safe); advisor with NO watch_paths → required (globs absent = no narrowing); case-insensitive match honored end-to-end.
- [ ] **Step 2 — FAIL → Step 3 — implement → Step 4 — PASS** + typecheck + full board suite (the Phase-0 P0-1 tests must stay green untouched — they prove the un-narrowed path). **Step 5 — commit** (`feat(board): watch_paths-precise advisor dispatch — fail-safe narrowing from push_chain`).
- [ ] **Acceptance:** a card whose complete chain touched only `docs/**` with advisor watching `src/auth/**` advances dev→test WITHOUT an advisor dispatch; the same card with an incomplete chain still dispatches the advisor.

### Task 5: Barrier advance becomes promote-shaped (CLAIM-free) — fix the stalled-epic bug
**Why (verified):** `decide.ts:79-85` barrier-advance returns `{kind:"advance", to, reason}` with NO role → `list-ready.mjs:77` omits role → SKILL.md's `advance` branch (`:78-83`) runs `claim.mjs <id> <role>` → `claim.mjs:16-19` `process.exit(2)` → a completed epic stalls silently every pass.
**Identity discriminator (MEDIUM finding):** `decide` emits `{kind:"promote"}` for BOTH `gate:"human"` (staging→prod, posts under `releaser`) and `gate:"barrier"` (epic_integrating→epic_done). Both stages have `owner:""`, so owner can't discriminate, and hardcoding state names in SKILL.md violates the derive-don't-hardcode rule (P0-7). Fix: add an additive optional `StageDef.promoteAs?: string` (mirrors the `rejectTo?` precedent, `types.ts:47`); the barrier stage config sets `promoteAs:"analyst"`, the human-gate `staging` sets nothing. `decide`'s promote legs carry `role: st.promoteAs` (undefined for human-gate). `list-ready.mjs:77` already forwards `a.role` when present; SKILL.md's promote branch passes it to `promote.mjs`'s optional role arg (default `releaser` → human-gate behavior UNCHANGED, backward compatible). This keeps identity config-driven and avoids widening orchestrator caps.
**Files:** Modify `platform/packages/orchestrator-core/src/decide.ts` (barrier leg `:82-83` → promote+role; human-gate leg `:89` → carry `role: st.promoteAs`); `src/types.ts:35-52` (`StageDef.promoteAs?: string`, additive optional); `test/decide.test.ts:88` (2a tripwire `.toEqual`, EXPECTED to change); **`test/fixtures/translate.ts:167`** (the frozen-corpus EXPECTED for "EPIC: integrating + 3/3 children done" → change `{kind:"advance",to:"done"}` to `{kind:"promote",to:"done"}` — `decide-corpus.test.ts:33` asserts `got.kind===exp.kind` and WILL go red otherwise); `test/fixtures/lifecycle.ts` (`EPIC_LC.integrating` gains `promoteAs:"analyst"`); `yarradev-board/skills/yarradev-board-run/scripts/promote.mjs` (optional 3rd arg `[role]`, default `"releaser"`, `makeClient({role})`); `SKILL.md` (gate-tags `:38-45` += a `barrier` paragraph; promote branch `:85-93` forwards the line's `role` to `promote.mjs`, and its 422 handling: a `blocked_by ⊇ human_go` → await human GO (existing); a `blocked_by ⊇ all_children_terminal` → a child regressed post-decision → log + fall through, re-derive next pass, NOT "await human GO"). Rebuild bundle + sha256 + drift guard.
**Core change (exact):**
```ts
// barrier leg:
if (card.children_done >= card.children_total)
  return { kind: "promote", to: st.to, role: st.promoteAs, reason: `fan-in: all ${card.children_total} children done` };
// human-gate leg (decide.ts:89): add role passthrough
return { kind: "promote", to: st.to, role: st.promoteAs };   // promoteAs undefined for staging → role-free → releaser default
```
(the 0-children→escalate and partial→noop legs are UNTOUCHED — decide's 0-children escalate deliberately disagrees with the board's vacuously-true `all_children_terminal` at 0/0, `gates.ts:96-98`; that guard is load-bearing, keep it.)
- [ ] **Step 1 — failing tests (core):** `decide.test.ts:88` → exact `.toEqual({ kind: "promote", to: "done", role: "analyst", reason: "fan-in: all 3 children done" })` (EPIC_LC.integrating.promoteAs="analyst") → RED; corpus fixture `translate.ts:167` updated so `decide-corpus.test.ts` stays green; a human-gate promote test asserts `role` is absent/undefined (releaser default preserved).
- [ ] **Step 2 — implement (StageDef field + both legs) → PASS** + typecheck; rebuild bundle + sha256 + `check-vendored-core.sh` GREEN.
- [ ] **Step 3 — plugin:** `promote.mjs` accepts `[role]`; plugin test asserting the posted MOVE identity for the default (`releaser`) and `analyst` cases; SKILL.md paragraphs incl. the two-way 422 handling. Plugin `node --test` green.
- [ ] **Step 4 — commit** both repos (`fix(core): barrier fan-in advance is promote-shaped (CLAIM-free, promoteAs role) — a completed epic no longer stalls`).

### Task 6: CREATE plumbing — `boardClient.create()`, `Verdict "decomposed"`, `reduce` case, `create.mjs`
**Why:** the board fold is COMPLETE (`storage.ts:673-705`: CREATE takes `data.{type,state,parent_id,title}`, auto-wires `parent-of` + `children_total`; act type `CREATE` is gen-exempt, `acts.ts:62`; caller mints `item_id`, `storage.ts:1877-1878`). Orchestrator-core has zero plumbing: no `create()` helper, no verdict status for decomposition, no `reduce` case (survey-3 §4). v1 has NO precedent here (it created GitHub issues outside its op vocabulary) — this is new, keep it minimal.
**Files:** Modify `platform/packages/orchestrator-core/src/{types.ts,reduce.ts,boardClient.ts}` + tests; Create `yarradev-board/skills/yarradev-board-run/scripts/create.mjs` + `test/create-cli.test.mjs` (child_process pattern from `coherence-wiring.test.mjs`); rebuild bundle.
**Interfaces produced:**
- `BoardClient.create(id: string, data: { type?: string; title?: string; state?: string; parent_id?: string }): Promise<AppendResult>` → posts `{type:"CREATE", item_id:id, gen:null, data}` (mirror `advice()`'s thin-wrapper shape, `boardClient.ts:224`).
- `Verdict` union += `{ status:"decomposed"; to: string; children: { title: string; state?: string }[]; summary?: string }` (types.ts:24-33).
- `reduce(verdict{status:"decomposed"}, card, lifecycle)` → `[ CREATE×N (each `{type:"CREATE", item_id:"", data:{type:"story", title, state: child.state ?? "backlog", parent_id: card.id}}`), MOVE(card → verdict.to) ]` — CREATEs FIRST so `children_total` is bumped before the epic reaches its barrier stage. Validate: `verdict.to` must equal `lifecycle[card.state].to` else escalate (same rule as the `advance` case, `reduce.ts:40-46`); empty `children[]` → escalate `"decomposed with 0 children"` (mirrors decide's 0-children barrier guard). ⚠️ **NON-RUNTIME (symmetry only):** `reduce()` is NOT on the live conductor path — the production decompose path is SKILL.md's `decomposed` branch → `create.mjs` (which mints `crypto.randomUUID()`), same as `rejectTo`/reduce is latent today (`types.ts:47`). This `reduce` case exists for shape-completeness + the exhaustiveness `never` guard (`reduce.ts:80-83`); the emitted `item_id:""` is a documented caller-fills contract (the board REJECTS empty `item_id` on CREATE, `storage.ts:1877-1878`, so a future driver posting reduce output directly MUST fill ids first). Pin a test asserting the case emits `item_id:""` + the caller-fills contract comment; do NOT imply it's the runtime path.
- `create.mjs <title...> [--id <id>] [--type story|epic] [--state <s>] [--parent <id>] [--lane fast|full]` — `--lane full`→`state=spec`, `--lane fast`→`state=dev` (lane and state mutually exclusive, lane wins documented); default state omitted → board default (`backlog`, `storage.ts:674`); posts via `makeClient({role:"analyst"})`… role: `--role` flag default `analyst` (cockpit/human creates go through the dashboard, not this script). Raw `client.create()` (new wrapper via rebuilt vendor bundle).
- [ ] **Step 1 — failing core tests:** `create()` wire shape (fakeFetch postedBody equality, incl. `gen:null`); reduce `decomposed` → exact ActPost array (CREATEs then MOVE, parent_id threaded, default state backlog); `decomposed` with wrong `to` → ESCALATE; 0 children → ESCALATE.
- [ ] **Step 2 — FAIL → Step 3 — implement → Step 4 — PASS** + typecheck; rebuild bundle + sha256 + drift GREEN.
- [ ] **Step 5 — plugin:** `create.mjs` + child_process test (hermetic http stub asserting the POSTed `{type:"CREATE", data:{...}}` body for `--lane fast`, `--parent`, `--type epic`; exit 2 on missing title). Plugin suite green.
- [ ] **Step 6 — commit** both repos (`feat(core+plugin): CREATE plumbing — decomposed verdict, boardClient.create, create.mjs with lanes`).

### Task 7: `analyst.md` persona + conductor wiring
**Why:** v1's proven analyst contract (`yarradev-tbd/agents/analyst.md`): at `analysis` — read the epic's intent, write a short brief (goal, seams, risks, acceptance), advance; at `decompose` — split into the smallest set of independent stories, create each child card linked to the epic, advance to the barrier stage. Park-don't-spin via `question` when too big/unclear.
**Files:** Create `yarradev-board/agents/analyst.md` (clone `designer.md`'s structure — Inputs/Job/Verdict/Rules, `:1-45`); Modify `SKILL.md` (token table `:52-61` += `analyst` row (`YDB_TOKEN_ANALYST`, falls back to `YDB_TOKEN`); verdict handling += the `decomposed` branch). Test: extend the plugin agent-frontmatter test expectations if any count is pinned.
**analyst.md frontmatter (CI guard compliance — BOTH fields mandatory):** `name: analyst` · `description: …` · `tools: Read, Grep, Glob` (read-only on code — v1 parity; NO Bash/Write: an analyst never mutates) · `model: sonnet` · `effort: high` · `role: analyst` · `authority: worker` · `stage: [epic_analysis, epic_decompose]`.
**Verdict contract (exactly one fenced json block, LAST in output — house style):** at `epic_analysis`: `{status:"advance", to:"<given to>", summary:"<brief>"}`; at `epic_decompose`: `{status:"decomposed", to:"<given to>", children:[{title:"…"}, …], summary}`; anywhere: `{status:"question", summary}` to park. Rules: derive stage/`to` from the dispatch inputs, never hardcode (P0-7 discipline); one terminal verdict; children titles must be independently-shippable story statements.
**SKILL.md `decomposed` branch (placed with the other verdict rules):** on `{status:"decomposed"}` from an analyst-role dispatch: for each `children[i]` → `node $S/create.mjs "<title>" --parent <epicId>` (board bumps `children_total` per CREATE, `storage.ts:698`); then `node $S/move.mjs <epicId> <gen> <to> analyst`; then CLEAR_LEASE as usual. 0 children in the verdict → treat as `question` (park — mirrors reduce's escalate).
- [ ] **Step 1:** analyst.md (frontmatter + Inputs/Job/Verdict/Rules per above); plugin `node --test` green (the frontmatter guard `no-cheap-model-on-veto.test.mjs:63-71` now covers 6 agents).
- [ ] **Step 2:** SKILL.md wiring (token row, decomposed branch, dispatch-context note: analyst dispatches carry the epic's title/intent + the target `to`).
- [ ] **Step 3 — commit** (`feat(plugin): analyst persona + decomposed-verdict conductor wiring`).

### Task 8: Epic lifecycle config + gate-kind coherence + fast-lane surface
**Files:** Modify `platform/scripts/configs/acme-main-v2.json` (+ snapshot via `--write`); `yarradev-board/skills/yarradev-board-run/config/board.json` + `board.example.json`; `yarradev-board/test/config-coherence.test.mjs:32` (7-key pin → 11 keys); `platform/dashboard/src/cockpit-render.ts:100` area (fast-lane create form). (NO `config.ts`/`assertLifecycleCoherent` change — the gate-kind check was dropped, see below. No core change in this task ⇒ no bundle rebuild here; the epic-lifecycle keys live in plugin config + acme config only.)
**Config (acme-main-v2.json) — additive:**
- `machine.states` += `["epic_analysis","epic_decompose","epic_integrating","epic_done"]`; `machine.terminal` += `"epic_done"`.
- Transitions: `epic_analysis→epic_decompose` (MOVE, gate `{p:"judgement"}` — match how spec→dev judges today); `epic_decompose→epic_integrating` (MOVE, judgement); `epic_integrating→epic_done` (MOVE, gate `{p:"all_children_terminal"}` — first live use of `gates.ts:96-98`). NO reject edges for the epic tier in 2b (v1 had none in `epic_stages`).
- `caps`: add explicit grant rows for the `analyst` role in the config's `caps` array — the verified shape is `{kind:"agent", role, act_type}` (`acme-main-v2.json:27-67`, enforced via `cap_snapshot` at `storage.ts:92`). Author these exact rows: `{kind:"agent",role:"analyst",act_type:"CLAIM"}`, `{...,act_type:"MOVE"}`, `{...,act_type:"CREATE"}`, `{...,act_type:"ASK"}`, `{...,act_type:"CLEAR_LEASE"}` (mirrors the worker act-set the `designer` row grants, plus `CREATE` for decomposition). This authorizes both the analyst's decompose CREATEs and the barrier promote's MOVE-under-analyst (T5).
- Run `scripts/check-config-hash.sh --write` + commit the snapshot (MANDATORY — CI fails otherwise); `check-watch-paths.sh` must stay green (advisor globs untouched).
**Plugin lifecycle (board.json + board.example.json) — merged flat, disjoint keys (D6):**
```json
"epic_analysis":    { "owner": "analyst", "to": "epic_decompose",   "gate": "judgement" },
"epic_decompose":   { "owner": "analyst", "to": "epic_integrating", "gate": "judgement" },
"epic_integrating": { "owner": "",        "to": "epic_done",        "gate": "barrier" },
"epic_done":        { "owner": "",        "to": null }
```
plus an `_epic_note` (style of `_budgets_note`, `board.json:21`) citing v1 provenance (4-stage proven; 7-stage vision excluded). Update `config-coherence.test.mjs:32`'s exact-key assertion to the 11-state array.
**`assertLifecycleCoherent` — NO gate-kind↔predicate cross-check in 2b (adversarial finding, dropped).** The check as originally drafted is impossible: `assertLifecycleCoherent(lifecycle, machine: BoardMachine)` receives a `BoardMachine` whose transitions are `{type,from,to}` with gate exprs **intentionally stripped over the wire** (`packages/shared/src/types.ts:159` "gate exprs intentionally omitted"; `readMachine()` projection `storage.ts:1600-1602`; `list-ready.mjs:37-42` passes the gate-less machine straight in). Inspecting `machine.transitions[].gate` would read an always-`undefined` field → either the implementer stalls or "makes it pass" with a silent no-op that validates nothing (the exact fake-protection trap). The existing state-graph coherence (state-set equality + forward/rejectTo edge existence) is what actually gates routing and already covers the epic states. A real gate-kind↔predicate check would require carrying `gate?: GateExpr` through `BoardMachine.transitions` + `readMachine()` + the plugin's `machineFor()` synth — out of 2b scope. → moved to Deferred.
**Fast-lane surface (D3, thin):** dashboard cockpit — a lane selector on the existing CREATE form (`cockpit-render.ts:100`, `cockpit-actions.ts:31-35` already takes arbitrary `state`): `full → spec`, `fast → dev` (+ epic → `epic_analysis` with `type:"epic"`). No schema change, no board change.
- [ ] **Step 1 — failing tests:** plugin `config-coherence.test.mjs:32` updated pin RED against the old 7-key expectation once epic keys land (then green with the 11-key array); a board test compiling the new acme config (via `compile()`) proving `epic_integrating→epic_done` blocks at 1/3 children and passes at 3/3 (real gate eval through `buildGateInputs` against `all_children_terminal`).
- [ ] **Step 2 — FAIL → Step 3 — implement all surfaces → Step 4 — PASS:** platform suites + plugin suites + typecheck + ALL FOUR guards (config-hash regenerated!). (No core source change in this task → no bundle rebuild; if the epic work here surfaced a needed core tweak, rebuild + drift as usual.)
- [ ] **Step 5 — commit** both repos (`feat(governance): epic 4-stage lifecycle live — barrier gate wired, coherence gate-kind check, fast-lane create`).

---

## Phase 2b acceptance gate
- [ ] **Stalled-epic bug dead:** an epic at `epic_integrating` with 3/3 children done → `list-ready` emits `promote` → conductor MOVEs CLAIM-free under `analyst` → epic reaches `epic_done`. 0-children epic → escalate (both by test; live walkthrough if a board token is available).
- [ ] **Decompose works end-to-end:** an analyst `decomposed` verdict creates N children (`children_total` bumps), epic advances to the barrier, children completing to terminal bump `children_done` (existing fold `storage.ts:648-659`), barrier releases.
- [ ] **Narrowing is fail-safe (the security bar):** complete-chain + zero-match card skips the advisor dispatch; ANY of {no chain, gap, force-push, truncation, no watch_paths knowledge} → advisor dispatched exactly as today. P0-1 tests untouched and green. The advisor's self-diff remains the verdict authority (no board-side verdict change anywhere).
- [ ] **Fast lane:** `create.mjs --lane fast` lands a card in `dev`; cockpit lane selector works.
- [ ] All suites green (`pnpm -r test` + plugin `node --test`); `pnpm -r typecheck` clean; vendored-bundle drift + config-hash (regenerated snapshot) + watch-paths + no-cheap-model guards PASS; LikeC4 drift-check green (model updated: analyst role + epic flow — flip/extend the plugin roles container + a flowEpicFanIn dynamic view if cheap; at minimum keep the existing check green).
- [ ] (AMBER) PR per repo; CI green → merge **plugin-first**; **this phase SHIPS a deploy**: `workers/board` (schema v8 + gate inputs) + `workers/webhook` (push extraction) → `board → api → webhook` via `scripts/deploy.sh`; **config re-apply IS required this time** (epic states + caps changed acme-main-v2.json) — capture the pre-apply live config as rollback ref FIRST, then apply, then live-verify (compiled config serves the epic states; a seeded epic card routes).
- [ ] RUN-LOG updated with SHAs + AMBER evidence; ledger updated.

## Self-review
- **Spec coverage:** 2a-deferred list → tasks: watch_paths narrowing w/ authenticated source (T1-T4, D1), epic/analyst + barrier fix + children rollup verify (T5-T8), fast-lane (T6 create.mjs + T8 cockpit), scanners (D2 → Deferred), bulk reconcile (D4 → Deferred). Runbook §4 Phase-2 leftovers all disposed. No orphans. ✓
- **Security model:** narrowing NEVER consumes reviewee-reported data; the only new input is HMAC-verified webhook payloads; every uncertainty leg keeps the advisor required; the advisor's verdict path is untouched; outbound.ts stays sealed. The plan-review knockout from 2a cannot recur. ✓
- **Trust-the-tripwire:** 2a deliberately tightened `decide.test.ts:88` to force T5 — the plan updates it, not preserves it. ✓
- **Deploy reality:** board schema v8 + webhook extraction + CONFIG re-apply (unlike 2a where config was untouched) — all called out in the gate with rollback-ref-first. ✓
- **Types consistent:** `PushFilesFact` (T2) mirrors the board-side union member (T3, mirrored-not-imported per house rule); `watchMatch` consumed only in T4; `Verdict "decomposed"` produced in T6, consumed by SKILL.md branch (T7); `promote` role arg produced in T5, consumed by SKILL.md barrier ¶ (T5) and caps (T8). `epic_*` names identical across acme-main-v2.json, board.json, coherence tests, analyst.md `stage:`. ✓
- **Risk:** T3's completeness rule is the crux — a bug that reports `complete=1` for a gapped/forced/pointer-move chain silently skips a VETO-authority advisor. **Hardened after adversarial review:** completeness now requires `head_reached` (the push introduced its own tip — closes the created-at-pre-existing-commit empty-file hole), and T4 fails safe on an ambiguous multi-row `head_sha` join (never picks an arbitrary row). Its test list is exhaustive on the false-positive side (gap/force/truncate/pointer-move/ambiguous-join/sticky). Framing: narrowing is a cost optimization whose only failure mode is over-dispatch; the advisor self-diff remains the security boundary. Reviewer attention should still concentrate here (a per-task adversarial re-check of T3+T4 before merge is worth it).
- **Adversarial-review disposition (2026-07-02):** verdict was NEEDS REVISION (3 blocking + 2 medium + 1 minor); ALL folded in — B1 security core (head_reached + ambiguous-join fail-safe, T2/T3/T4), B2 impossible coherence gate-kind check DROPPED (gate exprs stripped over the wire; → Deferred), B3 frozen-corpus `translate.ts:167` fixture added to T5, M1 promote identity via additive `StageDef.promoteAs` + two-way 422 handling (T5), M2 truncation via `commits.length>=20` not a nonexistent `payload.size` (T2), m1 reduce-decomposed marked non-runtime symmetry (T6). Sound parts confirmed untouched: T1 glob port, children rollup keying, CREATE board fold, caps shape.

---

## DEFERRED (carry forward; do NOT lose)
- **Content scanners (D2):** v1 mechanism (registry `scanners.json`, added-lines-only + 4000-char ReDoS cap `run-scanners.js`, OR-backstop `v1-eval-gates.js:283-306`, CODEOWNERS-protected registry) — never proven live in v1; revisit when a real need appears, ship disabled-by-default if so.
- **Bulk reconcile / pin re-sync (D4):** generalized update-pin-over-N-cards operator command → Phase 3 candidate.
- **Outbound GitHub App client (`GET /pulls/{n}/files`)** — Phase 5 per `outbound.ts:4`; would upgrade narrowing from branch-chain-complete to exact PR file lists; requires App ID + PEM secrets + RS256 JWT + permission verification.
- **7-stage epic vision (Triage→Feasibility→…→Release, hub PO/PM/e2e roles):** zero evidence anywhere — do NOT build.
- **Coherence gate-kind↔predicate check (moved here from T8, adversarial B2):** `assertLifecycleCoherent` cannot currently inspect gate exprs — `BoardMachine.transitions` is `{type,from,to}` with gate exprs stripped over the wire (`types.ts:159`, `readMachine()` `storage.ts:1600-1602`). To add a "`gate:"barrier"` edge must carry `all_children_terminal`" invariant, first carry `gate?: GateExpr` through `BoardMachine.transitions` + `readMachine()` projection + the plugin's `machineFor()` synth, THEN add the check. Worth doing once the epic tier is live and drift risk is real.
- **Exact PR-vs-base changed-files (upgrade for narrowing):** candidate (a) `GET /pulls/{n}/files` via an unsealed outbound GitHub App client (Phase 5) would replace push-chain's "complete since first observed introducing-push" with the true PR diff, covering the cases push-chain fails safe on (branch cut from arbitrary base). Requires App ID + PEM secrets + RS256 JWT + permission verification.
- **Risk-tier gating** (shadow-only; 2 corpus cases still deferred), **thread_budget**, **conductor→reduce() migration** (with the rejectTo replaces-vs-augments note + reduce-error-vs-ask divergence): standing defers.
- **2a tracked minors** (getJson 404-chatty; CHEAPEST_TIER_MODELS deny-list extension; agent-frontmatter coupling note): fold opportunistically, not 2b tasks.
