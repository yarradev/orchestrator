# Orchestrator Unification — Master Execution Runbook

> **For agentic workers:** This is the spine of an autonomous multi-phase program. Use **superpowers:subagent-driven-development** (recommended) or **superpowers:executing-plans** to run each phase task-by-task. Steps use checkbox (`- [ ]`) syntax. A **fresh session can execute this end-to-end** — read §0 Context, obey §1 Autonomy Contract, then run the §3 loop.

**Goal:** Collapse the four fractured "orchestrator" artifacts into **one** (the `yarradev-board` plugin + a bundled typed `orchestrator-core`) driving **one smart Cloudflare board**, reproducing v1's proven behavior on the platform's stronger substrate — cleaning the whole mess in one program.

**Architecture:** Plugin = sole keyless runtime (user's LLM sub) → typed `orchestrator-core` (decide/reduce/one boardClient, bundled to vendored `.mjs`) → Cloudflare board (platform: enforces gates server-side). GitHub Issues backend dropped. See the design spec.

**Tech stack:** TypeScript (core, platform workers, dashboard), `.mjs` + `node:test` (plugin), Cloudflare Workers/DO/D1/R2/Queues, pnpm workspaces, vitest, LikeC4.

## Global constraints (verbatim, apply to every task)
- **Behavioral parity, board owns server-enforced gates** — the core routes, the board disposes, subagents propose. Don't reintroduce a backend seam; there is ONE backend (Cloudflare).
- **Keyless** — the plugin/core never holds or calls an LLM key; role work runs as Claude Code Agent-tool subagents on the user's subscription.
- **TDD, frequent commits, DRY, YAGNI** — every code task: failing test → minimal impl → green → commit.
- **Deploy order is load-bearing:** `board → api → webhook` (via `scripts/deploy.sh`).
- **No schema migration unless a task says so;** additive DO/D1 migrations are guarded (`_migrations`).
- **Cite `path:line`; the board is authoritative — never bypass gates/fences.**

## 0. Context — read these first (a fresh session needs nothing else)
1. `orchestrator/docs/2026-07-01-orchestrator-unification-design.md` — the approved design (WHAT + WHY).
2. `orchestrator/docs/2026-07-01-v1-parity.md` — the behavioral spec: P0 acceptance bar, P1 must-port, P2 deferred, evidence-ranked from yanyja.
3. `orchestrator/docs/2026-07-01-runtime-convergence-gap-analysis.md` — the code-level gap detail with `path:line` cites.
4. `orchestrator/docs/2026-07-01-unification-phase0-p0-fixes.md` — the fully-detailed Phase 0 plan.
5. v1 reference (read-only oracle): clone `gh repo clone yarrasys/yarradev` → its `docs/methodology.md`, `protocol.md`, `board-schema.md`, `skills/yarradev-run/scripts/{eval-gates.js,fixtures/cases.json}`. `cases.json` (60+ decision fixtures) is the behavioral test oracle for `orchestrator-core`.

Repos: `~/work/yarradev/{platform,orchestrator,yarradev-board}`. Live board: `acme:main` at `app.yarradev.ai` (admin ops use `ADMIN_TOKEN` from `platform/.env`).

## 1. Autonomy contract (the point of this doc — do NOT re-ask for these)
The user delegated autonomous execution on 2026-07-01. Classify every action:

- **🟢 GREEN — do freely, never ask:** read/analyze/graphify; create branches; write code + tests; run tests/typecheck/lint; local commits; push branches; open PRs; expand phase plans via writing-plans; dispatch subagents; update the LikeC4 model + run its drift check.
- **🟡 AMBER — pre-authorized, gated on evidence (do it, don't pause, but record proof first):**
  - **Prod deploy** (`source .env && echo y | scripts/deploy.sh`) — only after: full suite green (`pnpm -r test`) + `pnpm -r typecheck` clean + (if a PR) its CI green. Record versions in the RUN-LOG.
  - **Merge PR → main** — only after CI green + self-review.
  - **Apply CONFIG to live `acme:main`** — only after: `compile()`/`likec4`/tests validate the config AND a pre-flight `GET .../config` (or public cards read) is saved to the RUN-LOG as rollback reference.
  - **`gh repo archive` the 4 `yarrasys/*` leftovers** (`yarradev`, `yarradev-platform`, `yarradev-plugin`, `claude-plugins`) — only after `git ls-remote`/compare confirms **0 unmerged commits** vs their `yarradev/*` successors.
  - **`gh api repos/.../transfer`** (already done for public-claude-plugins) — n/a.
- **🔴 RED — STOP, leave a note, wait for a human:** deleting a repo (archive only, never delete); force-push to `main`; secret rotation/rekey; `wrangler delete`; anything touching a tenant other than `acme`; uninstalling GitHub Apps in org settings (no API — human-only).

For every AMBER action: run the verification checklist → append `[AMBER] <action> — evidence: <...>` to the RUN-LOG → proceed. Never block waiting for approval on GREEN/AMBER.

## 2. RUN-LOG (resumability)
Maintain `orchestrator/docs/2026-07-01-unification-RUN-LOG.md`: append one line per completed task/gate/AMBER action with commit SHA + evidence. A fresh/resumed session reads it first to find its place. This is how "clean once and for all" survives session boundaries.

## 3. Execution loop (self-driving — follow verbatim)
```
for phase in [0, 1, 2, 3]:
  1. Read this runbook's phase section + its acceptance gate.
  2. If a detailed plan file for the phase does NOT exist:
        invoke superpowers:writing-plans against the design+parity docs,
        scoped to THIS phase only → save docs/2026-07-01-unification-phase<N>-*.md
     (Phase 0's detailed plan already exists — skip expansion, execute it.)
  3. Create a feature branch: git checkout -b feat/unification-phase<N> (off main).
  4. Execute task-by-task via superpowers:subagent-driven-development (TDD, commit per task).
  5. Run the phase Acceptance Gate (below). All must pass.
  6. Open a PR; when CI green (AMBER) merge to main; (AMBER) deploy if the phase ships prod code.
  7. Append phase-complete to the RUN-LOG. Proceed to the next phase.
Stop only on a RED action or a genuine blocker (record it in the RUN-LOG).
```

## 4. Phases

### Phase 0 — P0 correctness/security (on the CURRENT split codebase)
**Why first:** these bit in production or are live holes; fix before any refactor so prod stops being wrong. **Detailed plan:** `2026-07-01-unification-phase0-p0-fixes.md` (7 tasks, TDD, exact tests). Summary checklist:
- [ ] **P0-1** Non-vacuous `advisor_clear` — require a review record at the advisor stage (interim; blocks dev→test with no security review). `platform/packages/shared/src/gates.ts`, `platform/workers/board/src/storage.ts` (`buildGateInputs` advisor block).
- [ ] **P0-2** Wire `tests_green` on `test→done` + admin **named-check allowlist** (fail-closed on absent). `platform/scripts/configs/acme-main-v2.json`, `gates.ts`, `workers/webhook/src/extract.ts`.
- [ ] **P0-3** Rework-staleness — gen-scope/reset `ci_rollup`/`linked_head_sha` on REJECT so a mechanical gate can't fire on the pre-reject PR. `platform/workers/board/src/storage.ts` (MOVE/REJECT fold + `buildGateInputs`).
- [ ] **P0-4** `releaser` role owns staging (mechanical) + prod (human-go), never autonomous prod merge — verify caps + edges + agent persona. `acme-main-v2.json`, `yarradev-board/agents/releaser.md`.
- [ ] **P0-5** Developer agent links PRs with non-closing `Refs #N`; engine closes the card once at terminal. `yarradev-board/agents/developer.md`; verify board LINK_PR/close-once.
- [ ] **P0-6** Stale-epoch REJECT never reprocessed — add a regression test reproducing yanyja `#281` (superseded REJECT at old gen must 409/ignore, not bounce a shipped card). `platform/workers/board/test/`.
- [ ] **P0-7** Role-agent templates derive `from-stage` from the card's live stage, never a literal. Audit `yarradev-board/agents/*.md`.
- **Acceptance gate:** all suites green (`pnpm -r test` in platform + `node --test` in plugin); `pnpm -r typecheck` clean; a NEW test proves each of P0-1/2/3/6 fails before the fix and passes after; deploy (AMBER) + re-apply CONFIG (AMBER) if config changed; verify on `acme:main` (a watched-path card blocks dev→test; a red-test card can't reach done).

### Phase 1 — Unify the code (extract core, delete adaptors, one decide)
Expand into a detailed plan at execution. Task checklist:
- [ ] Extract `orchestrator-core` from the `orchestrator` repo: keep `decide`/`reduce`/types; **delete** `backend.ts` seam, `adaptor-github`, `adaptor-board`, `YD_BACKEND` factory, `CanonicalCard`. Core's card model becomes the board's `EnrichedItem` (from the board client types).
- [ ] Build one typed `boardClient` in core (union of what `lib.mjs` + `@yarradev/board-client` covered: list/getEnriched/config/acts/batch + all act helpers incl. `clear-hold`).
- [ ] Backport `promote`/`gate:"human"` into core so it is a true superset of the plugin.
- [ ] Add a build step: `tsc` → bundle core to a vendored `.mjs` inside the plugin; add a CI guard that the vendored `.mjs` matches `tsc` output.
- [ ] Generate the plugin's `decide.mjs` from core (delete the hand-rolled `decide.mjs` + `lib.mjs`); plugin keeps only the conductor + role subagents.
- [ ] Retire `platform/orchestrator/` → `platform/examples/board-smoke/` (a minimal LLM-free contract test proving the board API is drivable).
- [ ] Single-source the lifecycle: plugin `board.json` + any core lifecycle derived from `GET /config`, or a startup coherence check; retire the stale 4-state `orchestrator/config/lifecycle.json`.
- **Acceptance gate:** one `decide` (no drift); plugin has no `lib.mjs`/hand-`decide.mjs`; all suites + v1 `cases.json` corpus green; `examples/board-smoke` passes; plugin still drives `acme:main` end-to-end (dogfood a card backlog→prod).

### Phase 2 — Port P1 proven policy
Expand into a detailed plan at execution. Task checklist:
- [ ] Board-drift → ESCALATE (overlay set with no matching act). Port from v1 `eval-gates.js:164-178`.
- [ ] Respawn backstop (B): count respawn CLAIMs toward `within_budget{transitions}`; delete dead `respawnLimit`; keep the time-window as secondary.
- [ ] Persist ADVICE/clean advisor reviews (new act or fold) so `headFresh()` re-review works for the non-veto path.
- [ ] Content scanners: port `checks/run-scanners.js` + `scanners.json` server-side, admin/CODEOWNERS-protected; OR scanner hits into `advisor_clear`; add the dead-glob (`check-watch-paths`) CI check.
- [ ] Wire `watch_paths` into advisor `required` once the webhook carries changed files (moves A from interim → precise).
- [ ] Epic/analyst tier (C): wire the fan-in barrier transition into the machine; add the `analyst` role (cap + persona); expose `children_total/done` through the board client; add the epic branch to core `decide` (port from `decide.ts:164-169`).
- [ ] Fast-lane entry (full→spec vs fast→dev, operator-selected per card).
- [ ] First-class bulk reconcile that also re-syncs the card summary; generalize the no-cheapest-model-on-veto CI guard across all advisors.
- [ ] `config_hash` drift check in CI (diff committed `scripts/configs/*.json` vs live board).
- **Acceptance gate:** watched-path PR is blocked until a real advisor review (scanner-backed); board-drift escalates; epic with children fans in; respawn loop escalates within budget; suites green; deploy (AMBER).

### Phase 3 — Repo/naming cleanup
Expand into a detailed plan at execution. Task checklist:
- [ ] (AMBER) `gh repo archive` the 4 `yarrasys/*` leftovers after confirming 0 unmerged commits.
- [ ] Absorb/retire `yarradev/orchestrator` (its core now lives bundled in the plugin) — archive after the extract lands.
- [ ] Collapse to **3 live repos**: `yarradev/platform`, `yarradev/yarradev-board`, `yarradev/public-claude-plugins`.
- [ ] Update the LikeC4 `runner` model to point at the plugin (URL links, CI-safe) + demote the stub; run the drift check.
- [ ] (Optional, flagged) rename plugin `yarradev-board` → `yarradev` now that the name is free (skill + plugin.json + marketplace + settings); its own mini-plan.
- **Acceptance gate:** exactly 3 live yarradev repos; LikeC4 validates + drift-check green; docs reference only the 3.

## 5. Deferred (P2 — do NOT build unless a later spec says so)
QUESTION/ANSWER + `thread_budget` · risk-tier *gating* (shadow/observability only for now) · auto-ESCALATE gate-weight · cross-board/multi-repo federation · free/paid board tiering · the constitution→`yarradev-compile` chain (never built in v1; `compile()` already exceeds it). Record any that become necessary as their own spec.

## 6. Self-review (done by the author of this runbook)
- Spec coverage: every P0 (§4 Phase 0) + every P1 (§4 Phase 2) + repo outcome (§4 Phase 3) + the design's deletions (§4 Phase 1) maps to a task. ✓
- No placeholders in Phase 0 (see its detailed plan); Phases 1–3 are task-checklists to be expanded just-in-time per §3 step 2 (explicit, not a placeholder). ✓
- Autonomy: irreversible ops enumerated + gated (§1). ✓
