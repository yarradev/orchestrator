# Runtime → Orchestrator Convergence — Gap Analysis

**Date:** 2026-07-01 · **Status:** analysis (no code changed) · **Target:** `orchestrator` repo behavior · **Stance:** behavior parity (the platform board may own server-enforced gates; the runtime delegates where the board is authoritative — a gap counts only if the target behavior isn't achieved by *runtime + board* together).

Artifacts: **orchestrator** repo (`~/work/yarradev/orchestrator`, TS = the spec) · **yarradev-board** plugin (`~/work/yarradev/yarradev-board`, the live runtime) · **platform** board (`~/work/yarradev/platform/workers/board` = enforcer; `packages/shared` = acts/gates/types) · **configs** (`platform/scripts/configs/acme-main-v2.json` live machine, plugin `board.json`, orchestrator `config/lifecycle.json`).

---

## 0. Executive summary — the reframe

"Orchestrator is the target" is true for **behavior/logic**, but convergence is **bidirectional**, and a third party (the board) must absorb several behaviors that no client can implement:

1. **The orchestrator repo cannot actually drive the platform board today.** Its `adaptor-board` reads a **phantom `stage` field** (board emits only `state`=stage-name) so every card's stage is `""`, and it **cannot emit `LINK_PR`/`PUSH`** (those Ops map to `null`). The **plugin's** platform adaptor is the *more correct* one.
2. **The plugin is missing the orchestrator's core brain:** no `reduce` (verdict→ops) layer, no advisor-dispatch logic, no reviewed-head tracking, no epic fan-in, no deadline/malformed escalation.
3. **Several target behaviors are impossible client-side** on either client because the board read model doesn't expose the inputs (`pr.files`, per-advisor `reviewedHead`, `bounces`, `malformed`) → they **must** be board-owned. This validates the behavior-parity stance.
4. **There are genuine server-side enforcement holes** the runtime currently papers over — most seriously that the security **advisor is never actually run**, and `advisor_clear` passes **vacuously**.

**Target ownership (behavior parity):**
- **Board owns:** all gate *enforcement* (ci_green, tests_green, no_open_veto/hold, advisor_clear, human_go, fan-in, budgets), lease/gen fencing, auth, act validation, materialization, watch_paths config, bounce/deadline counting.
- **Runtime (plugin) owns:** `decide` routing + `reduce` (verdict→ops), role-agent dispatch + LLM billing, respawn dispatch, deploy — *executing the orchestrator spec*.
- **Orchestrator repo = the behavior spec** (single source of truth for decide+reduce); its platform adaptor must be fixed to the plugin's correctness. The `platform/orchestrator/src` stub is **redundant** → demote to an example/contract fixture.

---

## 1. Consolidated findings by severity

### 🔴 P0 — correctness/security holes (fix first)

| # | Finding | Where | Consequence |
|---|---|---|---|
| P0-1 | **Security advisor is never dispatched; `advisor_clear` is vacuously true.** No runtime spawns the advisor; the board predicate returns true when no advisor row exists. Compounded by role-name drift (`security` vs `security-advisor`), stage drift (`development` vs `dev`), and `pr.files` being invisible to every client. | decide.ts:83-118 (no runtime peer); gates.ts:87-90 × storage.ts:382-387; team-policy.json:3 vs acme-main-v2.json:59-82 | A PR touching `**/auth/**`, `**/*secret*`, `**/payments/**` advances dev→test with **zero security review**. |
| P0-2 | **`tests_green` gate enforced nowhere.** Orchestrator marks `testing` mechanical/tests_green; plugin `test` declares no gate; live `test→done` edge checks only `{not_blocked, no_open_veto}`. | lifecycle.json:6 vs board.json:14 vs acme-main-v2.json:13-14 | A card reaches `done` with **red or absent tests**. |
| P0-3 | **Orchestrator `adaptor-board` is broken vs the platform:** phantom `ec.stage` (→ `CanonicalCard.stage=""`, `listCards({stages})` returns nothing) and `linkPR`/`pushHead` Ops map to `null`. | conventions.ts:53-77, :28 | The "target" **cannot drive the platform board's stage read or CI head-match** as-is. Plugin is correct here. |

### 🟠 P1 — behavior gaps & enforcement leaks

| # | Finding | Where | Note |
|---|---|---|---|
| P1-1 | **No `reduce` (verdict→ops) layer in the runtime** — it's prose in SKILL.md; no verdict-parsing under test. | SKILL.md:103-124 vs reduce.ts:9 + verdict.test.ts | Deepest *architectural* gap. Net-new logic, not just tests. |
| P1-2 | **Epic fan-in barrier unavailable to both clients** (board-client type drops `children_total/done`); runtime has no epic path; board can gate but nothing drives the epic MOVE. | decide.ts:164-169; board-client types.d.ts:10-28; decide.mjs (no epic) | Epics don't auto-advance when children finish; 0-child escalate lost. |
| P1-3 | **Veto park is load-bearing client-side because board `no_open_veto` is gen-scoped** — a CLAIM-bumped advance slips past it. | decide.mjs:40-45 (comment); gates.ts:83 | Server enforcement leak compensated by the client → make board veto **item-sticky**. |
| P1-4 | **Reviewed-head / clean review not persisted.** No act records a clean/advice review; `reviewedHead` is board-only; head-freshness re-review only bites already-vetoed cards. | decide.ts:106-110; storage.ts:577; lib.mjs (no clean act) | "Approve old code, then push" advances unreviewed. |
| P1-5 | **`done→staging` "judgement" tag is a lie** — live edge enforces only `{no_open_veto}`; no verdict/human predicate → auto-promotes. | board.json:15 vs acme-main-v2.json:15-16 | Routing hint implies a review the machine doesn't require. |
| P1-6 | **Respawn bound divergence:** orchestrator count-based (`respawnLimit`, reads `counters.respawns` the board never tallies → would never fire) vs plugin time-based (`respawn_window_ms`) vs board neither. | decide.ts:179-183 vs decide.mjs:65-70; storage.ts:754-755 | Pick a canonical policy; if count-based, board must tally respawns. |
| P1-7 | **Human cap role mismatch** — `owner-caps.ts` emits `role:"owner"`; live CONFIG uses `role:""`. | owner-caps.ts:5-15 vs acme-main-v2.json:62-69 | Owner authorized via `ownerCaps()` may not satisfy CONFIG grants (verify matcher). |
| P1-8 | **No client reads `GET /config`** — orchestrator + plugin each keep a *local* lifecycle; coherence with the compiled board machine is prose-only. | index.ts:339 (unused); decide.mjs comment | Gate/stage drift is unguarded (root cause of P0-2, P1-5). |
| P1-9 | **Orchestrator `lifecycle.json` is a stale 4-state vocabulary** (`design/development/testing/done`, `done` terminal) vs 7-state live machine. | lifecycle.json vs acme-main-v2.json | Must be re-mapped/regenerated, not diffed. |
| P1-10 | **HOLD can be set but never cleared client-side** (no `clear-hold` script / no `CLEAR` emit). | lib.mjs (only clear-veto); acts.ts CLEAR | A held card wedges until cockpit/manual intervention. |
| P1-11 | **HUMAN_GO gen-stamping is a fragile temporal contract** — `human_go` reads `spec_approved` at `gen===current_gen`; an early GO is invalidated by the `done→staging` CLAIM. | storage.ts:325; SKILL.md:88-90 | Board should treat GO for the target edge, not gen-pinned. |

### 🟡 P2 — smaller behavior/coverage gaps

- **Decision-deadline escalation dropped** — `question_deadline_passed` predicate exists but is wired into no default gate; runtime never checks it → blocked cards park forever. (gates.ts:92)
- **Unknown-stage silently noops** (runtime) vs **escalate** (target) → mistyped stage strands a card invisibly. (decide.mjs:32 vs decide.ts:123)
- **Malformed-card escalation missing** — runtime has no `malformed` concept. (decide.ts:125)
- **Releaser can return `question` but has no `ASK` cap** → fenced. (releaser.md:47-50 vs acme-main-v2.json:55-58)
- **Plugin drops `escalated`** from its card mapping → can't route escalated cards; posts one `/acts` call per act instead of `/batch`. (lib.mjs:120-137)
- **Op vocabulary silently lossy** — `ask`, `recordReview` Ops → `null` with no diagnostic. (conventions.ts:28)
- **Advisor detail dropped** — adaptor sets `advisors:{}`; plugin skips enriched entirely. (conventions.ts:71)
- **Veto/hold guard asymmetry** — `backlog→spec` checks `no_open_veto`; `spec→dev` checks `no_open_hold` (not both). (acme-main-v2.json:7-10)

### 🔵 P3 — hygiene / cosmetic

- `platform/orchestrator/src` stub is **redundant** → demote to `examples/` or a contract-test fixture.
- Published `@yarradev/board-client` types drifted from platform `shared` types (re-declares `stage`, drops `output_present`/`children_*`/`escalated_reason`).
- Over-grants: orchestrator `CREATE`, designer `REJECT` never dispatched.
- `clear_authority`, `lease/skew`, `per_edge_overrides` each defined in only one of the three configs.
- Plugin `decide.mjs` provenance comment points at the wrong/outdated ancestor.

---

## 2. Behaviors that MUST be board-owned (cannot be client-side)

The board read model can't supply these to any client, so behavior parity requires the **board** to own them:

| Behavior | Missing input | Board fix |
|---|---|---|
| Advisor-on-watched-paths (P0-1) | `pr.files` not in any read/act | Webhook/CI must carry changed files → board stores → `advisor_clear` requires a review when watch_paths match; **interim**: require an advisor review at the advisor's stage regardless (advisor runs on every dev card). |
| Reviewed-head freshness (P1-4) | `reviewedHead` per advisor is board-only | Persist clean/advice reviews (new act or fold) + surface head-freshness in `advisor_clear`. |
| Sticky veto (P1-3) | `no_open_veto` is gen-scoped | Make veto item-sticky across gens. |
| Bounce / deadline enforcement | `bounces`, `question_deadline_passed` not client-visible | Wire `within_budget{bounces}` on backward edges (present) + add `question_deadline_passed` to blocked-card handling. |

---

## 3. Prioritized convergence plan

**Phase 0 — close the security holes (P0):**
- **B1 (board):** make `advisor_clear` non-vacuous — require an advisor review to exist at the advisor stage (interim: always; target: when watch_paths match, once file list is available).
- **B2 (config):** add `tests_green` to the `test→done` edge; make `done→staging` enforce a real verdict/human gate (or drop the "judgement" tag honestly).
- **C1 (config):** fix advisor role-name/stage drift (`security-advisor`@`dev`) across all three configs; reconcile watch_paths to one authoritative set.
- **O1 (orchestrator):** fix `adaptor-board` stage mapping (`state`=stage) and implement `LINK_PR`/`PUSH` Ops.

**Phase 1 — single-source the lifecycle + fix enforcement leaks (P1):**
- Derive plugin `board.json` + orchestrator `lifecycle.json` from the compiled board machine (or add a startup coherence check against `GET /config`). Retire the stale 4-state `lifecycle.json`.
- Make board veto item-sticky (B, removes the client compensation).
- Persist clean/advice reviews + reviewed-head; make HUMAN_GO target-edge based.
- Decide canonical respawn policy (recommend **time-based**, since count needs a new board tally); align both.
- Fix human cap role (`""` vs `owner`); add releaser `ASK` cap; add `clear-hold`.

**Phase 2 — port the missing runtime brain (P1 architectural):**
- Add a **`reduce`** layer to the plugin (verdict→ops), generated from / kept in lockstep with `core/reduce.ts`; add verdict-parsing + reduce tests (mirror `verdict.test.ts`, `reduce-*.test.ts`).
- Add epic fan-in (needs board-client to expose `children_*` + runtime epic path).
- Add deadline / unknown-stage / malformed escalation to `decide.mjs`.

**Phase 3 — hygiene (P2/P3):**
- Demote `platform/orchestrator/src` to a fixture; reconcile board-client vs shared types; fix provenance comment; add `escalated` to plugin mapping + `/batch`; remove over-grants.

**Cross-cutting principle:** make the **orchestrator `core` the single source of truth** for `decide`/`reduce`; the plugin's `decide.mjs`/reduce should be generated from or verified against it, so the 3-way copy stops drifting.

---

## 4. Open decisions for the user
1. **Advisor enforcement model:** interim "advisor runs on every dev card" vs target "watch_paths-gated" (needs webhook to carry changed files). Which now?
2. **Respawn policy canon:** time-based (simpler, plugin already does it) vs count-based (needs a board respawn tally). Recommend time-based.
3. **Lifecycle single-source:** generate configs from the board machine, or add a runtime coherence check? 
4. **Reduce layer:** hand-port `core/reduce.ts` → `.mjs`, or make the plugin call a shared/compiled module?
