# Unification Phase 0 — P0 Correctness/Security Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. TDD throughout — the **failing test is the spec**; make it pass with the minimal change in the named file. Checkbox (`- [ ]`) steps. Obey the MASTER runbook's Autonomy Contract (§1).

**Goal:** Close the seven P0 holes that bit in production (yanyja) or are live correctness/security defects — on the *current* codebase, before any refactor.

**Architecture:** All changes land in the platform (`~/work/yarradev/platform`) board + config, plus the plugin's agent personas (`~/work/yarradev/yarradev-board`). No refactor here.

**Tech stack:** TS + vitest via `cloudflare:test` `runInDurableObject` (board tests), `node:test` (plugin). Test harness template: `platform/workers/board/test/delete-item.test.ts` (CONFIG `ActInput` fixture + `runInDurableObject`).

## Global constraints
- TDD: failing test first, run to confirm fail, minimal impl, run to confirm pass, commit.
- Board is authoritative; changes are additive (no destructive migration).
- Branch: `feat/unification-phase0` off `main` in `platform` (and a sibling branch in `yarradev-board` for persona edits).
- Acceptance: each of P0-1/2/3/6 has a test that FAILS before and PASSES after.

---

### Task 1: P0-1 — `advisor_clear` non-vacuous (+ minimal clean-review record)

**Problem:** `advisor_clear` returns true when no advisor row exists (`gates.ts:87-90` × `storage.ts:369-388`; `headFresh(null)⇒true`), so a watched-path PR advances dev→test with zero review. A card at an advisor-bearing stage must not clear until an advisor review exists for the current head. This requires a way to record a *clean* review (today only VETO/HOLD write `advisor_state`).

**Files:**
- Modify: `platform/packages/shared/src/acts.ts` (add `ADVICE` to `ALL_ACT_TYPES`, gen-exempt fence mode)
- Modify: `platform/packages/shared/src/gates.ts` (`advisor_clear` predicate + inputs)
- Modify: `platform/workers/board/src/storage.ts` (fold `ADVICE` → `advisor_state` row `{veto_open:0,hold_open:0,reviewed_head}`; `buildGateInputs` advisor block: `clear` requires a row with `reviewed_head` prefix-matching the current linked head)
- Modify: `platform/scripts/configs/acme-main-v2.json` (grant `security-advisor` the `ADVICE` cap)
- Test: `platform/workers/board/test/advisor-clear.test.ts` (new)

**Interfaces produced:** `ADVICE` act `{item_id, by:security-advisor, data:{reviewed_head}}` → writes a clean `advisor_state` row; `advisor_clear` true iff every advisor joining the state has a row with `reviewed_head`≍current head and no open veto/hold.

- [ ] **Step 1 — failing test** (`advisor-clear.test.ts`): CONFIG a board with `security-advisor` advisor `joins_at:["dev"]`; CREATE card `c1`; CLAIM developer; LINK_PR + PUSH head `h1`; INGEST_FACT ci_green@h1; developer MOVE dev→test → assert `outcome:"gate_blocked"`, `blocked_by` includes `advisor_clear`. Then security-advisor `ADVICE {reviewed_head:"h1"}`; MOVE dev→test again → assert `committed`.
- [ ] **Step 2 — run, expect FAIL** (`pnpm --filter '*board*' test advisor-clear` — currently MOVE #1 commits because advisor_clear is vacuous).
- [ ] **Step 3 — implement:** add `ADVICE` act + fold + the `advisor_clear` "review must exist @head" rule per Files.
- [ ] **Step 4 — run, expect PASS**; run full board suite (`pnpm --filter '*board*' test`) — no regressions.
- [ ] **Step 5 — commit** (`fix(board): advisor_clear requires a review at the advisor stage (P0-1)`).

Note: interim = "a review exists for this head" (any advisor stage). Precise watch_paths/scanner gating is Phase 2 (needs changed-files in the webhook).

---

### Task 2: P0-2 — enforce `tests_green` on `test→done` + named-check allowlist

**Problem:** `test→done` gate is `{not_blocked,no_open_veto}` — `tests_green` enforced nowhere; and any `check_name` the webhook reports satisfies a `*_green` predicate (no trusted-name allowlist). gh#27 "false production" bit repeatedly in yanyja.

**Files:**
- Modify: `platform/scripts/configs/acme-main-v2.json` (`test→done` gate → `{all:[{p:"tests_green"},{p:"not_blocked"},{p:"no_open_veto"}]}`; add an `allowed_checks` list to the config)
- Modify: `platform/packages/shared/src/gates.ts` (`tests_green`/`ci_green` resolve against `allowed_checks`, fail-closed if the reported `check_name` is not allowlisted)
- Modify: `platform/packages/shared/src/compile.ts` (validate + surface `allowed_checks`)
- Modify: `platform/workers/board/src/storage.ts` (`ingestFactSync`: only fold a fact toward a `*_green` rollup if `check_name ∈ allowed_checks`)
- Test: `platform/workers/board/test/tests-green.test.ts` (new) + extend `github-facts` test

- [ ] **Step 1 — failing test:** card at `test`; INGEST_FACT with `check_name:"random-untrusted"` conclusion success; MOVE test→done → assert `gate_blocked` (`tests_green` fails, untrusted check ignored). Then INGEST_FACT `check_name:"e2e"` (allowlisted) success; MOVE → `committed`.
- [ ] **Step 2 — run, expect FAIL** (today test→done ignores tests_green entirely).
- [ ] **Step 3 — implement** per Files; add `"e2e"` (and existing CI names) to `allowed_checks`.
- [ ] **Step 4 — run, expect PASS**; full board suite green.
- [ ] **Step 5 — commit** (`fix(board): enforce tests_green on test→done + named-check allowlist (P0-2)`).

---

### Task 3: P0-3 — rework-staleness fencing on REJECT

**Problem:** REJECT into a mechanical stage doesn't invalidate the pre-reject green PR; `ci_rollup`/`linked_head_sha` aren't gen-scoped/reset, and `ci_green` reads the raw scalar — so a `test→dev` REJECT is immediately followed by an auto-advance back to test with zero rework (v1 fixed this in v0.3.8; mirror the existing `review_approved` `headFresh()` pattern).

**Files:**
- Modify: `platform/workers/board/src/storage.ts` (REJECT fold: stamp `rework_since_gen = current_gen` on the item, or clear `ci_rollup` to `absent`; `buildGateInputs`: `ci_green` requires the CI fact's head to be ≥ the post-reject linked head / gen — reuse `headFresh`)
- Modify: `platform/packages/shared/src/gates.ts` if `ci_green` needs a freshness input
- Test: `platform/workers/board/test/rework-staleness.test.ts` (new)

- [ ] **Step 1 — failing test:** card advances dev→test with ci_green@h1; tester REJECT test→dev; developer (same gen or after CLAIM) attempts MOVE dev→test WITHOUT a new PR/CI → assert `gate_blocked` (ci_green stale); then LINK_PR/PUSH h2 + ci_green@h2 → MOVE → `committed`.
- [ ] **Step 2 — run, expect FAIL** (today the stale h1 green re-advances it).
- [ ] **Step 3 — implement** the gen/head freshness fence per Files.
- [ ] **Step 4 — run, expect PASS**; full board suite green.
- [ ] **Step 5 — commit** (`fix(board): rework-staleness — REJECT invalidates pre-reject CI (P0-3)`).

---

### Task 4: P0-6 — stale-epoch REJECT never reprocessed (regression test)

**Problem:** yanyja `#281` — a superseded REJECT at an old gen got reprocessed and bounced a *shipped* card. Confirm the target's gen-fence already prevents this; lock it with a test (add the fence if the test fails).

**Files:** Test: `platform/workers/board/test/stale-epoch-reject.test.ts` (new); if failing, Modify `platform/workers/board/src/storage.ts` FENCE step.

- [ ] **Step 1 — failing/regression test:** card at gen 2 (post-CLAIM); submit a REJECT with `gen:1` (stale) → assert `outcome:"fenced"` (409), state unchanged, no bounce counted.
- [ ] **Step 2 — run:** expect PASS (fence likely already correct) — if FAIL, it's a real bug: implement the gen-check on REJECT in the FENCE step.
- [ ] **Step 3 — (if impl needed) run, expect PASS**; full board suite green.
- [ ] **Step 4 — commit** (`test(board): stale-epoch REJECT is fenced, never reprocessed (P0-6)`).

---

### Task 5: P0-4 — `releaser` owns staging (mechanical) + prod (human-go)

**Files:**
- Verify/Modify: `platform/scripts/configs/acme-main-v2.json` (`releaser` caps: MOVE for done→staging + staging→prod; NO autonomous prod merge — prod requires `human_go`)
- Verify/Modify: `yarradev-board/agents/releaser.md` (persona: deploy to staging → MOVE; prod only via HUMAN_GO, never self-approve)
- Test: `platform/workers/board/test/releaser-caps.test.ts` (new)

- [ ] **Step 1 — failing test:** releaser attempts MOVE staging→prod without `human_go` → `gate_blocked` (human_go); with a human HUMAN_GO recorded → releaser MOVE succeeds. Releaser attempts done→staging → allowed by caps.
- [ ] **Step 2 — run, expect FAIL/PASS** (adjust caps/gate to match).
- [ ] **Step 3 — implement** caps/persona; **Step 4 — run PASS**; **Step 5 — commit** (`fix: releaser owns staging + human-gated prod (P0-4)`).

---

### Task 6: P0-5 — non-closing `Refs #N`; engine closes card once

**Files:** Modify `yarradev-board/agents/developer.md` (PR body uses `Refs #N`, never `Closes/Fixes #N`); Verify board closes the card exactly once at the terminal transition (add a test if unproven).

- [ ] **Step 1** — audit `developer.md` + any PR-body template; change `Closes`→`Refs`.
- [ ] **Step 2** — board test: reaching the terminal state closes the card once; a linked PR merge does not double-close. Add if missing.
- [ ] **Step 3 — commit** (`fix(plugin): developer links PRs with non-closing Refs #N (P0-5)`).

---

### Task 7: P0-7 — derive `from-stage`, never hardcode in role templates

**Files:** Audit `yarradev-board/agents/*.md` for hardcoded stage literals (v1's `designer.md:30` hardcoded `from-stage:design` and broke on rename).

- [ ] **Step 1** — grep personas for `from-stage:`/`stage:<literal>`; replace with an instruction to read the card's current stage and use it.
- [ ] **Step 2** — commit (`fix(plugin): role agents derive current stage, never hardcode (P0-7)`).

---

## Phase 0 acceptance gate
- [ ] New tests for P0-1/2/3/6 each fail before, pass after.
- [ ] `pnpm -r test` (platform) + `node --test` (plugin) all green; `pnpm -r typecheck` clean.
- [ ] PR opened; CI green → (AMBER) merge to main.
- [ ] If config changed: (AMBER) re-apply `acme-main-v2.json` to live `acme:main` (pre-flight GET saved to RUN-LOG); (AMBER) deploy board→api→webhook.
- [ ] Live verify on `acme:main`: a watched-path card blocks dev→test until an ADVICE review; a random-check card cannot reach done; a REJECTed card needs fresh CI to re-advance.
- [ ] RUN-LOG updated with commit SHAs + deploy versions + config seq.

## Self-review
- Every P0 (1–7) has a task; P0-1/2/3/6 are test-first with concrete failing tests (the spec); P0-4/5/7 are audit+verify tasks with tests where a behavior is assertable. No "TBD"/"add error handling" placeholders. Types introduced (`ADVICE` act, `allowed_checks`, rework-freshness input) are consistent across Tasks 1–3.
