# Unification Phase 3 — Repo/naming cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (recommended for this phase — it is ops/git/gh work, not code TDD, so batch-with-checkpoints fits better than per-task subagents). Steps use checkbox (`- [ ]`) syntax. Obey the MASTER runbook Autonomy Contract (§1): 🟢 GREEN do freely · 🟡 AMBER pre-authorized, record evidence in the RUN-LOG FIRST · 🔴 RED stop for a human. Design: `2026-07-01-unification-phase3-repo-cleanup-design.md` (user-approved 2026-07-02).

**Goal:** Collapse the program's repo sprawl to exactly 3 live `yarradev/*` repos (`platform`, `yarradev-board`, `public-claude-plugins`), preserving the program record in platform, with LikeC4 + surviving docs referencing only the 3. Archive (never delete) the 5 dead repos.

**Architecture:** Migrate the unification docs (incl. the frozen v1 oracle) into `platform/docs/orchestrator-unification/` via a PR; per-repo audit each dead repo to prove nothing valuable is lost; `gh repo archive` the 5 dead repos (orchestrator last, after its docs PR merges); sweep the LikeC4 model + surviving docs for dead-repo references; verify the 3-live end-state.

**Tech Stack:** `git`, `gh` CLI (GitHub), `jq`, `likec4` CLI, pnpm workspaces (platform).

## Global Constraints (apply to every task)

- **Archive-only — NEVER delete a repo** (🔴 RED boundary). `gh repo archive` is reversible (unarchive); `gh repo delete` is forbidden.
- **AMBER actions** (`gh repo archive`): run the task's safety check → append `[AMBER] archive <repo> — evidence: <verdict>` to the RUN-LOG → then archive. Never block waiting for approval on GREEN/AMBER; do stop (🔴) if a safety check FAILS (stranded commits) and surface it to the human.
- **Do NOT touch out-of-scope repos:** only these 5 are archived — `yarradev/orchestrator` + `yarrasys/{yarradev, yarradev-platform, yarradev-plugin, claude-plugins}`. Leave `yarrasys/{dexter-the-doc-analyser-template, yarrasys-website-v2, extensions, yarrasys-website}` untouched.
- **Do NOT execute the red-list item** — uninstalling GitHub App `143035290` from the `yarrasys` org is human-only (no API); note it in the RUN-LOG, do not attempt it.
- **The RUN-LOG is authoritative.** It currently lives at `orchestrator/docs/2026-07-01-unification-RUN-LOG.md`; after Task 1 it ALSO lives in platform. During execution, append to BOTH copies (or to the platform copy once the PR is open) so the record survives the orchestrator archive. Every task ends by appending its evidence line.
- **`gh` auth:** confirm `gh auth status` shows write access to the `yarradev` AND `yarrasys` orgs before Task 4. If archiving a `yarrasys/*` repo returns 403, STOP — it's a permissions gap for the human, not a code problem.

---

## Task 1: Migrate the unification docs into platform (GREEN)

**Files:**
- Create (in `platform`): `docs/orchestrator-unification/` — a copy of all 12 files from `orchestrator/docs/`:
  - `2026-07-01-orchestrator-unification-design.md`, `2026-07-01-runtime-convergence-gap-analysis.md`, `2026-07-01-unification-MASTER-runbook.md`, `2026-07-01-unification-phase0-p0-fixes.md`, `2026-07-01-unification-phase1-code-unify.md`, `2026-07-01-unification-phase2a-governance-precision.md`, `2026-07-01-unification-phase2b-epic-tier-precision.md`, `2026-07-01-unification-phase3-repo-cleanup-design.md`, `2026-07-01-unification-phase3-repo-cleanup.md` (this plan), `2026-07-01-unification-RUN-LOG.md`, `2026-07-01-v1-parity.md`, `phase1-oracle/v1-cases.json`, `phase1-oracle/v1-eval-gates.js`.
- Modify (auto-memory): `/Users/nabsha/.claude/projects/-Users-nabsha-work-yarradev-platform/memory/MEMORY.md` and `orchestrator-unification-plan.md` — repoint the `orchestrator/docs/...` entry paths to `platform/docs/orchestrator-unification/...`.

**Interfaces:**
- Produces: the authoritative program record at `yarradev/platform:docs/orchestrator-unification/`. Task 4 (orchestrator archive) depends on this PR being MERGED.

- [ ] **Step 1: Branch platform**

```bash
cd /Users/nabsha/work/yarradev/platform && git checkout main && git pull origin main -q
git checkout -b chore/phase3-docs-migration
```

- [ ] **Step 2: Copy the docs tree (preserve structure incl. the oracle)**

```bash
mkdir -p docs/orchestrator-unification
cp -R /Users/nabsha/work/yarradev/orchestrator/docs/. docs/orchestrator-unification/
ls docs/orchestrator-unification docs/orchestrator-unification/phase1-oracle
```
Expected: all 10 `*.md` + the `phase1-oracle/` dir with `v1-cases.json` + `v1-eval-gates.js`.

- [ ] **Step 3: Fix intra-doc cross-references**

In the 8 files that reference the old location, rewrite `orchestrator/docs/<x>` → `docs/orchestrator-unification/<x>` and self-references to `yarradev/orchestrator` for docs paths → the platform path. Do NOT rewrite references to `yarradev/orchestrator` that describe the *repo being archived* (those are historical facts, keep them). Files to review: `…-design.md`, `…-gap-analysis.md`, `…-MASTER-runbook.md`, `…-phase1-code-unify.md`, `…-phase2a-…md`, `…-phase2b-…md`, `…-phase3-…-design.md`, `…-RUN-LOG.md`.

```bash
grep -rn "orchestrator/docs" docs/orchestrator-unification/   # find each hit, edit by hand (context-sensitive)
```
Expected after edits: `grep -rn "orchestrator/docs" docs/orchestrator-unification/` returns only intentional historical mentions (0 path-style refs).

- [ ] **Step 4: Add a README breadcrumb**

Create `docs/orchestrator-unification/README.md`:
```markdown
# Orchestrator unification — program record

Migrated from the (now archived) `yarradev/orchestrator` repo in Phase 3 (2026-07-02).
Authoritative log: `2026-07-01-unification-RUN-LOG.md`. Entry point: `2026-07-01-unification-MASTER-runbook.md`.
Phases 0/1/2a/2b shipped to prod; Phase 3 (this cleanup) completes the program.
```

- [ ] **Step 5: Commit + PR**

```bash
git add docs/orchestrator-unification
git commit -m "docs: migrate orchestrator-unification program record into platform (Phase 3)"
git push -u origin chore/phase3-docs-migration
gh pr create --repo yarradev/platform --base main --head chore/phase3-docs-migration \
  --title "Phase 3: migrate orchestrator-unification docs into platform" \
  --body "Moves the unification program record (incl. frozen v1 oracle) from the soon-to-be-archived yarradev/orchestrator into platform/docs/orchestrator-unification/. Docs-only."
```

- [ ] **Step 6: Verify CI + MERGE (AMBER-lite: docs-only, CI green)**

```bash
gh pr checks <PR#> --repo yarradev/platform     # expect model/config/vendored-core all pass (docs-only → no code drift)
gh pr merge <PR#> --repo yarradev/platform --merge
```
Expected: merged; `platform` main now contains `docs/orchestrator-unification/`.

- [ ] **Step 7: Repoint the auto-memory pointers**

Edit `MEMORY.md` + `orchestrator-unification-plan.md`: replace `orchestrator/docs/` path prefixes with `platform/docs/orchestrator-unification/`. Add a one-line note "(migrated Phase 3)".

- [ ] **Step 8: RUN-LOG evidence** — append to the RUN-LOG (both copies): `Phase 3 T1 · docs migrated to platform docs/orchestrator-unification (PR <#> merged <sha>); memory pointers repointed`.

---

## Task 2: Content-audit `yarradev/orchestrator` before archiving (GREEN)

**Files:** none modified — this is a read-only audit producing a RUN-LOG verdict.

**Interfaces:**
- Produces: a documented "nothing stranded in orchestrator" verdict (feeds Task 4's orchestrator archive evidence).

- [ ] **Step 1: Enumerate branches + audit `main`**

```bash
T=$(mktemp -d); git clone --bare https://github.com/yarradev/orchestrator "$T/orch.git"
git -C "$T/orch.git" for-each-ref --format='%(refname:short) %(objectname:short)'
# Inspect main's tree — is there code not reimplemented in platform/packages/orchestrator-core?
git -C "$T/orch.git" ls-tree -r --name-only main | head -50
```
Expected: `main`, `design/orchestrator-unification`, `feat/smoke-board-backend`. Determine whether `main` holds original/adaptor code superseded by the Phase-1 extract (`platform/packages/orchestrator-core`) — it should be either empty/stale or fully reimplemented.

- [ ] **Step 2: Audit `feat/smoke-board-backend`**

```bash
git -C "$T/orch.git" log --oneline main..feat/smoke-board-backend | head
git -C "$T/orch.git" ls-tree -r --name-only feat/smoke-board-backend | head -50
```
Expected: confirm it is superseded by `platform/examples/board-smoke` (Phase-1 retire). If it contains anything NOT in `platform/examples/board-smoke`, note it — decide keep-as-historical (archive is readable) vs port. Default: archive-as-historical unless something is genuinely load-bearing and unported.

- [ ] **Step 3: Confirm docs are migrated** — `design/orchestrator-unification` content == what Task 1 landed in platform (spot-check the RUN-LOG + MASTER runbook are present in platform).

- [ ] **Step 4: RUN-LOG evidence** — append: `Phase 3 T2 · orchestrator content-audit: docs migrated (T1); main = <verdict: stale/reimplemented in orchestrator-core>; feat/smoke-board-backend = <verdict: superseded by platform/examples/board-smoke>. Nothing stranded → safe to archive.` If anything IS stranded, STOP (🔴) and surface it.

---

## Task 3: Successor-parity checks for the 4 `yarrasys/*` leftovers (GREEN audit → AMBER evidence)

**Files:** none modified — read-only determination producing per-repo RUN-LOG verdicts.

**Interfaces:**
- Produces: a per-repo verdict (shared-history-0-unmerged OR disjoint-content-preserved) for each of the 4 leftovers. Task 4's archive of each depends on its verdict passing.

Run this determination procedure for EACH pair (`yarrasys/yarradev-platform`↔`yarradev/platform`, `yarrasys/yarradev-plugin`↔`yarradev/yarradev-board`, `yarrasys/claude-plugins`↔`yarradev/public-claude-plugins`; the oracle `yarrasys/yarradev` has NO successor → content-audit only):

- [ ] **Step 1: Determine relationship type (shared vs disjoint)**

```bash
T=$(mktemp -d); git clone --bare https://github.com/yarrasys/<OLD> "$T/old.git"
git -C "$T/old.git" remote add new https://github.com/yarradev/<NEW>; git -C "$T/old.git" fetch -q new
DEF_OLD=$(git -C "$T/old.git" symbolic-ref --short HEAD); DEF_NEW=$(git -C "$T/old.git" for-each-ref --format='%(refname:short)' 'refs/remotes/new/*' | grep -E 'new/(main|master)$' | head -1)
git -C "$T/old.git" merge-base "$DEF_OLD" "$DEF_NEW" >/dev/null 2>&1 && echo "SHARED" || echo "DISJOINT"
```

- [ ] **Step 2a (if SHARED): 0-unmerged-commits check**

```bash
git -C "$T/old.git" log --oneline "$DEF_NEW".."$DEF_OLD"   # commits in OLD not reachable from NEW
```
Expected: EMPTY → verdict `shared-history, 0 unmerged → safe`. If NON-empty → STOP (🔴): stranded commits, surface the list to the human, do NOT archive this repo.

- [ ] **Step 2b (if DISJOINT): content audit**

Confirm the old repo's substance is preserved: the successor is the reimplementation/relocation of the same product, and the old repo will remain fully readable after archive. For `yarrasys/yarradev` (v1 oracle) specifically: its behavioral value is the frozen `phase1-oracle/{v1-cases.json, v1-eval-gates.js}` (migrated into platform in T1) + the Phase-1 corpus parity already proven. Verdict: `disjoint/reimplemented; value preserved (frozen oracle + successor) + archive stays readable → safe`.

- [ ] **Step 3: RUN-LOG evidence per repo** — append one line each: `Phase 3 T3 · <yarrasys/repo> vs <yarradev/successor>: <SHARED 0-unmerged | DISJOINT value-preserved> → safe to archive`.

---

## Task 4: Archive the 5 dead repos (AMBER, pre-authorized)

**Files:** none — GitHub state changes, gated on Tasks 1–3.

**Interfaces:**
- Consumes: T1 (orchestrator docs PR merged), T2 (orchestrator audit clean), T3 (4 leftover verdicts safe).
- Produces: the 3-live end-state (verified in Task 6).

- [ ] **Step 1: Pre-flight — auth + confirm each safety verdict recorded**

```bash
gh auth status    # must show write to yarradev AND yarrasys
grep "Phase 3 T2\|Phase 3 T3" <RUN-LOG>   # all 5 safety verdicts present + "safe"
```
Expected: all 5 (orchestrator + 4 yarrasys) have a recorded `safe` verdict. Any repo without a passing verdict is NOT archived.

- [ ] **Step 2: Archive the 4 `yarrasys/*` leftovers** (each: RUN-LOG line FIRST, then archive)

```bash
for r in yarradev yarradev-platform yarradev-plugin claude-plugins; do
  echo "[AMBER] archive yarrasys/$r — evidence: T3 verdict safe" # → append to RUN-LOG
  gh repo archive "yarrasys/$r" --yes
done
```
Expected: each returns "✓ Archived repository yarrasys/<r>".

- [ ] **Step 3: Archive `yarradev/orchestrator` LAST** (only after T1 PR merged + T2 clean)

```bash
gh pr list --repo yarradev/platform --state merged --search "migrate orchestrator-unification"  # confirm T1 merged
echo "[AMBER] archive yarradev/orchestrator — evidence: docs migrated (T1) + content-audit clean (T2)" # → RUN-LOG
gh repo archive yarradev/orchestrator --yes
```
Expected: "✓ Archived repository yarradev/orchestrator".

- [ ] **Step 4: RUN-LOG evidence** — 5 `[AMBER] archive …` lines recorded (evidence-first).

---

## Task 5: LikeC4 + surviving-docs reference sweep (GREEN)

**Files:**
- Modify (platform): `likec4/model.c4` (+ `views.c4`/`specification.c4` if they carry stale refs) — repoint/annotate any `yarradev/orchestrator` or `yarrasys/*` reference.
- Modify (platform + yarradev-board): any surviving-repo doc referencing the archived repos.

**Interfaces:**
- Consumes: the archived-repo names from Task 4.
- Produces: model + docs referencing only the 3 survivors; drift-check + validate green.

- [ ] **Step 1: Sweep the LikeC4 model** (the `runner` is already plugin-pointed — this is residual)

```bash
cd /Users/nabsha/work/yarradev/platform
grep -rn "yarradev/orchestrator\|yarrasys/" likec4/
```
Expected: any hit is a link/description → repoint to the survivor (e.g. a `link https://github.com/yarradev/orchestrator/...` → the platform docs path, or annotate `(archived)`). Leave historical prose mentions if accurate.

- [ ] **Step 2: Validate + drift-check**

```bash
npx likec4 validate likec4
node scripts/likec4-check.mjs
```
Expected: `✓ Valid` + `✓ LikeC4 model in sync`.

- [ ] **Step 3: Sweep surviving-repo docs** (platform + yarradev-board)

```bash
grep -rn "yarradev/orchestrator\|yarrasys/yarradev" \
  /Users/nabsha/work/yarradev/platform/{README*,DEPLOY*,docs} \
  /Users/nabsha/work/yarradev/yarradev-board/{README*,SKILL*,skills} 2>/dev/null | grep -v "docs/orchestrator-unification"
```
Expected: update any live pointer to the archived repos → the survivor / the migrated docs path. Historical mentions inside `docs/orchestrator-unification/` are fine (that IS the archived program's record).

- [ ] **Step 4: Commit (+ PR each touched repo)** — `docs(likec4): reference only the 3 live repos (Phase 3 cleanup)`; CI green → merge. Rebuild bundle / config only if a code file changed (it won't — docs/model only).

- [ ] **Step 5: RUN-LOG evidence** — `Phase 3 T5 · LikeC4 + docs sweep: model validate ✓ + drift ✓; surviving docs reference only platform/yarradev-board/public-claude-plugins`.

---

## Task 6: Acceptance gate (verify)

- [ ] **Step 1: Exactly 3 live `yarradev/*` repos**

```bash
gh repo list yarradev --limit 50 --json name,isArchived | \
  jq -r '[.[]|select(.isArchived==false)]|map(.name)|sort|join(", ")'
```
Expected: `platform, public-claude-plugins, yarradev-board` (exactly 3).

- [ ] **Step 2: The 5 are archived**

```bash
gh repo view yarradev/orchestrator --json isArchived | jq .isArchived        # true
for r in yarradev yarradev-platform yarradev-plugin claude-plugins; do
  gh repo view "yarrasys/$r" --json isArchived | jq ".isArchived"            # all true
done
```
Expected: all `true`.

- [ ] **Step 3: LikeC4 green** — `node scripts/likec4-check.mjs` ✓ + `npx likec4 validate likec4` ✓ (re-confirm).

- [ ] **Step 4: RUN-LOG — Phase 3 + program complete**

Append: `✅ PHASE 3 COMPLETE — 3 live yarradev repos (platform, yarradev-board, public-claude-plugins); 5 archived (orchestrator + 4 yarrasys/*); LikeC4 ✓; docs reference only the 3. ✅ ORCHESTRATOR UNIFICATION PROGRAM COMPLETE (Phases 0/1/2a/2b/3).` Note the still-open red-list item: uninstall GitHub App 143035290 from yarrasys org (human-only).

---

## Deferred (do NOT do in Phase 3)

- **`yarradev-board` → `yarradev` rename** — its own future mini-project (blast radius: skill name, plugin.json, marketplace, every `yarradev-board:*` subagent type, SKILL.md, `YDB_*` tokens, settings). User-decided defer (2026-07-02).

## Red-list (human-only — Phase 3 cannot execute)

- **Uninstall inert GitHub App `143035290` from the `yarrasys` org** — no API path; the human does this in org settings. Phase 3 records it in the RUN-LOG; it is the last standing manual item after the program completes.

## Self-review

- **Spec coverage:** design tasks 1–6 map 1:1 to plan Tasks 1–6; runbook §3 checklist — archive 4 yarrasys/* (T3+T4), absorb/retire orchestrator (T1+T2+T4), collapse to 3 (T4→T6 gate), LikeC4 runner (T5, residual), optional rename (Deferred). ✓
- **Placeholder scan:** every step has a concrete command + expected output; the only `<PR#>`/`<OLD>`/`<NEW>`/`<RUN-LOG>` tokens are runtime-substituted values, not vague TODOs. ✓
- **Safety/consistency:** archive-only (never delete); AMBER evidence-first; every archive gated on a recorded `safe` verdict; STOP-on-stranded-commits; red-list excluded. ✓
- **Ordering:** T1 PR merged → T2/T3 audits → T4 archive (orchestrator last) → T5 sweep → T6 gate. Orchestrator archived only after its docs PR merges (no record loss). ✓
