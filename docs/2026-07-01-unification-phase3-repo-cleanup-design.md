# Unification Phase 3 — Repo/naming cleanup — Design

> Brainstormed + user-approved 2026-07-02 (max effort). This is the DESIGN (spec); the executable
> checkbox plan is produced by `superpowers:writing-plans` → `2026-07-01-unification-phase3-repo-cleanup.md`.
> Plan-only pass — executed in a fresh session under the MASTER runbook autonomy contract (§1).

## Goal

Collapse the orchestrator program's repo sprawl to **exactly 3 live `yarradev/*` repos**, preserving the
program record, with the architecture model + surviving docs referencing only the survivors. This is the
final phase of the unification program (Phases 0/1/2a/2b shipped to prod 2026-07-02).

**End-state (acceptance gate):**
- Exactly **3 live** `yarradev/*` repos: `platform`, `yarradev-board`, `public-claude-plugins`.
- **5 archived** (never deleted): `yarradev/orchestrator` + the 4 `yarrasys/*` leftovers (`yarradev`,
  `yarradev-platform`, `yarradev-plugin`, `claude-plugins`).
- LikeC4 `validate` + drift-check green; the model + all surviving docs reference only the 3.
- RUN-LOG carries per-repo AMBER evidence for every archive.

## Autonomy classification (MASTER runbook §1)

- 🟢 **GREEN** (do freely): docs migration, content audits, LikeC4 model edits, docs sweeps, `git ls-remote`/compare probes, branches/PRs.
- 🟡 **AMBER** (pre-authorized, evidence-gated): `gh repo archive <repo>` — only after the per-repo safety determination passes; record `[AMBER] archive <repo> — evidence: <…>` in the RUN-LOG first.
- 🔴 **RED** (human-only, do NOT do): **repo deletion** (archive only); force-push to main; **uninstalling the GitHub App `143035290` from the yarrasys org** (no API path — the standing red-list item).

## Current-state (verified live 2026-07-02)

**`yarradev/*` (target org) — 4 repos:**
| repo | archived | keep/archive |
|---|---|---|
| `platform` | no (private) | **KEEP** |
| `yarradev-board` | no (public) | **KEEP** |
| `public-claude-plugins` | no (public) | **KEEP** |
| `orchestrator` | no (public) | **ARCHIVE** (holds the unification docs + 2 non-docs branches) |

**`yarrasys/*` leftovers to archive — 4 repos** (all currently active): `yarradev` (v1 oracle/reference), `yarradev-platform`, `yarradev-plugin`, `claude-plugins`.
**Out of scope** (unrelated yarrasys repos — do NOT touch): `dexter-the-doc-analyser-template`, `yarrasys-website-v2`, `extensions`, `yarrasys-website` (already archived).

**`yarradev/orchestrator` branches (verified):** `design/orchestrator-unification` (docs, the program record), `main` (`a772bea`), `feat/smoke-board-backend` (`4b6c89f`).

**Already done (Phase 1/2 — reduces Phase 3 residual):**
- LikeC4 `runner` is already modeled as "Orchestrator Runner (yarradev-board plugin)" with a `conductor` component URL-linked to the plugin's `SKILL.md` and a `vendoredCore` component — the runner→plugin remodel is COMPLETE. The Phase-3 LikeC4 task is a *residual sweep*, not a remodel.
- The v1 oracle is frozen at `orchestrator/docs/phase1-oracle/{v1-cases.json, v1-eval-gates.js}` — it must ride along in the docs migration or it dies with the archive.

## The crux — proving each archive is safe

The runbook phrases the gate as "archive after **0 unmerged commits** vs successor." That git-ancestry
framing is only valid when a repo **shares history** with its successor. Two of the moves do not:
- `yarrasys/yarradev` (v1) was **reimplemented** on the platform substrate, not merged — it has no
  git-successor. Its value was **extracted** (the frozen oracle) + reimplemented (behavioral parity,
  proven by the Phase-1 corpus). Git ancestry is meaningless here.
- The other 3 `yarrasys/*` → `yarradev/*` moves may be transfers/clones (shared history) OR fresh repos
  (disjoint). `public-claude-plugins` was reportedly a transfer, yet `yarrasys/claude-plugins` still
  exists as a live repo — so the relationship must be **determined**, not assumed.

**Approach (chosen): per-repo relationship determination, then the fitting check.**
For each dead repo, establish whether a merge-base with its successor exists:
1. **Shared history** → `git log <old>/<default> ^<new>/<default>` (commits in old not reachable from new)
   must be **empty**. Non-empty ⇒ STOP, surface the stranded commits to the human (do not archive).
2. **Disjoint / reimplementation / oracle** → **content audit**: confirm the old repo's substance is
   preserved elsewhere (reimplemented in the survivor, or frozen — the oracle's cases/eval-gates migrated
   into platform). Archived repos remain fully readable, so the bar is *"nothing valuable is LOST,"* not
   *"nothing differs."*
Record the determination + verdict per repo in the RUN-LOG as the AMBER evidence.

*Rejected alternatives:* blanket git-ancestry (reports "everything unmerged" on the disjoint repos — a
false blocker); archive-without-checks (violates the AMBER evidence gate).

## Task units (each isolated; safety class marked)

1. **Docs migration → platform** *(GREEN)*
   Move the unification docs **including `phase1-oracle/`** from `orchestrator/docs/` into
   `platform/docs/orchestrator-unification/`. Fix internal cross-references (RUN-LOG self-refs, inter-doc
   links). Update the auto-memory pointer (`MEMORY.md` + `orchestrator-unification-plan.md`) to the new
   platform path. Land via a PR → `platform` main. **Blocks task 4's orchestrator archive.**
   *Interface:* the migrated tree is the single authoritative program record; nothing references the old
   `orchestrator/docs/` path afterward.

2. **Orchestrator content-audit** *(GREEN)*
   Audit `yarradev/orchestrator`'s 3 branches for stranded value:
   - `design/orchestrator-unification` → docs (migrated in task 1).
   - `main` (`a772bea`) → confirm the core is fully reimplemented in `platform/packages/orchestrator-core`
     (Phase 1) and nothing else of value remains.
   - `feat/smoke-board-backend` (`4b6c89f`) → confirm superseded by `platform/examples/board-smoke`
     (Phase 1 retire).
   *Output:* a documented "nothing stranded" determination (feeds the task-4 AMBER evidence).

3. **Successor-parity checks (4 `yarrasys/*`)** *(GREEN audit → AMBER evidence)*
   Apply the crux approach per leftover: `yarradev`(oracle, content-audit), `yarradev-platform`→`platform`,
   `yarradev-plugin`→`yarradev-board`, `claude-plugins`→`public-claude-plugins` (determine shared-vs-disjoint,
   then git-ancestry or content-audit). Record each verdict.

4. **Archive the 5 dead repos** *(AMBER, pre-authorized)*
   After tasks 1–3 pass: `gh repo archive` the 4 `yarrasys/*` leftovers + `yarradev/orchestrator`.
   Orchestrator archived **last** (only after its docs-migration PR has merged to platform). One RUN-LOG
   line per archive with its evidence. **Archive, never delete.**

5. **LikeC4 + docs reference sweep** *(GREEN)*
   Grep the LikeC4 model + all surviving-repo docs for `yarradev/orchestrator` / `yarrasys/*` references
   → repoint to the survivor or mark archived-historical. `likec4 validate` + drift-check green. (Runner
   already plugin-pointed — residual only.)

6. **Acceptance gate** *(verify)*
   `gh repo list yarradev` shows exactly the 3 survivors unarchived; LikeC4 green; surviving docs reference
   only the 3; RUN-LOG has AMBER evidence for all 5 archives. Append the Phase-3-complete + program-complete
   line to the RUN-LOG.

## Ordering / dependencies

`1 (docs migration PR merged)` → `2, 3 (audits, parallelizable)` → `4 (archive; orchestrator last)` → `5 (sweep)` → `6 (gate)`.
Tasks 2/3/5 have no code-crux and are largely mechanical; task 1 is the only one that changes a live repo (platform, via PR).

## Deferred (out of Phase 3 — user decision 2026-07-02)

- **`yarradev-board` → `yarradev` rename** — its own future mini-project (large blast radius on a live
  plugin: skill name, plugin.json, marketplace, every `yarradev-board:*` subagent type, SKILL.md, `YDB_*`
  tokens, settings). The current name works; deferred as YAGNI.

## Red-list (human-only, still open)

- **Uninstall the inert GitHub App `143035290` from the `yarrasys` org** — no API path; the human does this
  in org settings. Phase 3 notes it in the RUN-LOG but cannot execute it.

## Self-review

- **Scope:** every runbook §3 Phase-3 checklist item maps to a task — archive 4 yarrasys/* (T3+T4),
  absorb/retire orchestrator (T1+T2+T4), collapse to 3 (T4 outcome + T6 gate), LikeC4 runner update (T5,
  residual since already remodeled), optional rename (Deferred). ✓
- **Autonomy safety:** the only irreversible-ish action is `gh repo archive` (AMBER, reversible via
  unarchive); deletion + the App uninstall are RED and excluded. ✓
- **No stranded value:** the docs migration (incl. the oracle) precedes the orchestrator archive; the
  content audits (T2/T3) gate every archive. ✓
- **Honest crux:** the "0 unmerged commits" check is applied only where history is shared; the oracle +
  any disjoint repos get a content audit, not a false git-ancestry blocker. ✓
- **Ambiguity:** "docs reference only the 3" is made concrete by T5's grep sweep of the surviving repos. ✓
