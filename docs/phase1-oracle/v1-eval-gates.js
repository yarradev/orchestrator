#!/usr/bin/env node
/*
 * yarradev — eval-gates.js  (deterministic; no LLM, no network)
 *
 * Pure decision function: given a card's canonical board JSON (from read-board.sh)
 * and the lifecycle config (lifecycle.mvp.json), decide the one action the
 * orchestrator should take this tick, as an action object update-card.sh applies.
 *
 * Implements docs/methodology.md: §B1.1 idempotent guards, §B1.2 precedence-ordered
 * failure windows + epoch fencing, §B1.5 global transition budget (termination),
 * §A4 gates/backward edges, §A8 fail-closed holds.
 *
 * Usage:
 *   node eval-gates.js <board.json> [--config lifecycle.mvp.json]
 *   echo '<board json>' | node eval-gates.js --config lifecycle.mvp.json
 *
 * ── Canonical board JSON (the read-board.sh ↔ eval-gates.js contract) ─────────
 * {
 *   "card": 1,
 *   "title": "...",
 *   "type": "story",
 *   "stage": "design",                       // bare stage id (null if malformed)
 *   "now": "2026-06-20T12:00:30Z",           // orchestrator clock (read-board uses `date -u`)
 *   "overlays": { "agent_running": true, "blocked": false, "veto_held": false },
 *   "current_epoch": 1,                       // max epoch over orchestrator-authenticated CLAIMs
 *   "lease": {
 *     "active": true, "epoch": 1, "role": "designer",
 *     "ttl": 1800, "started_at": "2026-06-20T12:00:00Z"
 *   },
 *   "checks": { "ci_green": "success|pending|failure|absent",
 *               "tests_green": "success|pending|failure|absent" },
 *   "pr": { "linked": true, "changed_files": ["src/payments/charge.js"],
 *           "head": "deadbeef…" | null,          // current PR head OID (advisor re-review, gh#33)
 *           "scanner_hits": [ {"scanner_id":"…","matched":true} ] },  // content-scanner hits (gh#39)
 *   "risk": { "tier": "R0|R1|R2|R3|R4",          // deterministic from labels; missing/contra ⇒ R4 (gh#41)
 *             "reversible": "yes|no|null", "blast": "local|component|cross|null", "boundary": "yes|no|null",
 *             "missing_or_contradictory": false,
 *             "decision_approved": false,        // a [DECISION] risk:approved at current_epoch
 *             "escalated": false },              // an [ESCALATE] kind:risk at current_epoch
 *   "advisors": { "security-advisor": {
 *       "reviewed_at_epoch": false,            // an advisor verdict exists at current_epoch
 *       "reviewed_head": "deadbeef…" | null,   // the sha: the latest verdict echoed (gh#33)
 *       "veto_open": false, "veto_ever": false,
 *       "hold_open": false, "hold_escalated": false } },
 *   "authenticity": { "veto_cleared_by": "login" | null,    // who lifted a VETO/HOLD (gh#32 inert)
 *                     "hold_cleared_by": "login" | null },   // judged vs advisor.clear_authority
 *   "completion": {
 *     "terminal": { "by": "MOVE|REJECT", "from": "design", "to": "development", "epoch": 1 } | null,
 *     "output_present": false                 // worker NOTE / linked PR at current epoch (mechanical stages)
 *   },
 *   "open_question": { "cat": "product", "answered": false, "deadline_passed": false } | null,
 *   "answer_pending_unblock": false,          // an ANSWER exists for the blocking question
 *   "counters": { "transitions": 2, "bounces": { "testing->development": 0 } },
 *   "malformed": { "is_malformed": false, "reasons": [] }
 * }
 *
 * ── Action object (the eval-gates.js ↔ update-card.sh contract) ───────────────
 * { "card", "stage", "action", "reason", "ops": [ ...ops ] }
 *   actions: spawn | reclaim | advance | advance-backward | block | unblock | escalate | noop
 *            | spawn-advisor | veto-hold | veto-clear
 *   ops:     {op:"claim",role,epoch,ttl} {op:"spawn",role,epoch} {op:"set-stage",from,to}
 *            {op:"clear-lease"} {op:"add-label",label} {op:"remove-label",label}
 *            {op:"post",type,from,to,kvs,body} {op:"update-pin"}
 */
'use strict';

function gateStatus(b, advanceOn) {
  return (b.checks && b.checks[advanceOn]) || 'absent';
}

// Minimal glob → RegExp (supports ** , * , ?), for advisor watch_paths matching.
// Case-INSENSITIVE: real filenames are often CamelCase (PaymentService.java, Stripe.ts) and a
// security diff-hook must not miss them. (Path globs are a heuristic anyway — content-based
// secret/pii/payments scanning is the real net, §A6/§A8.)
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$', 'i');
}
function watchMatch(files, patterns) {
  if (!files || !files.length || !patterns || !patterns.length) return false;
  const res = patterns.map(globToRegExp);
  return files.some((f) => res.some((r) => r.test(f)));
}

// gh#32 (INERT): a CLEAR/ACK that lifted a VETO/HOLD by someone NOT in the advisor's clear_authority
// is the fail-open the issue flags — any issues:write token can post [CLEAR] to drop a hold. We SURFACE
// it as a non-blocking breadcrumb on the action reason; we do NOT enforce. Under the MVP's shared bot
// login an author check is partially a no-op (all agents post via one token), and fail-closed needs the
// identity-model decision (methodology B3.1) — so this stays observability-only until distinct
// identities exist. `clear_authority` (in 4 config files, previously read by zero code) is now read here.
function clearAuthWarnings(b, tp) {
  const auth = (b && b.authenticity) || {};
  const advs = (tp && tp.advisors) || [];
  const adv = advs.find((a) => a && a.authority === 'veto') || advs[0] || {};
  const allow = (adv.clear_authority || []).map((s) => String(s).replace(/^@/, ''));
  if (allow.length === 0) return []; // unconfigured → nothing to authenticate against
  const norm = (s) => String(s || '').replace(/^@/, '');
  const ok = (login) => allow.includes(norm(login));
  const w = [];
  if (auth.veto_cleared_by && !ok(auth.veto_cleared_by)) w.push(`VETO cleared by @${norm(auth.veto_cleared_by)} (not in clear_authority)`);
  if (auth.hold_cleared_by && !ok(auth.hold_cleared_by)) w.push(`HOLD released by @${norm(auth.hold_cleared_by)} (not in clear_authority)`);
  return w;
}

// Public entry point: run the core gate, then append the inert authenticity breadcrumb (gh#32). The
// wrapper only ever decorates `reason` — it never changes action/ops, so the gate stays fail-safe.
function decide(b, cfg, tp = { advisors: [] }) {
  const r = _decide(b, cfg, tp);
  const w = clearAuthWarnings(b, tp);
  if (r && w.length) r.reason = `${r.reason} · ⚠ ${w.join('; ')} — unauthenticated, inert (gh#32)`;
  return r;
}

function _decide(b, cfg, tp = { advisors: [] }) {
  const card = b.card;
  const mk = (action, reason, ops = []) => ({ card, stage: b.stage, action, reason, ops });
  const post = (type, to, body, kvs = {}) =>
    ({ op: 'post', type, from: 'orchestrator', to, kvs, body });
  // Escalation PARKS the card (label) so the next pass excludes it (list-ready.sh) — otherwise
  // an escalated card re-ticks and re-posts ESCALATE to @human every interval. A human clears
  // `escalated:needs-human` after answering. Also drop any held lease.
  const escalate = (reason) => {
    const ops = [post('ESCALATE', '@human', reason), { op: 'add-label', label: 'escalated:needs-human' }];
    if (b.overlays && b.overlays.agent_running) ops.push({ op: 'clear-lease' });
    ops.push({ op: 'update-pin' });
    return mk('escalate', reason, ops);
  };

  // 0. Malformed cards never advance — escalate and noop (fail-closed). §B1.1 advance guard
  if (b.malformed && b.malformed.is_malformed) {
    return escalate('malformed card: ' + (b.malformed.reasons || []).join('; '));
  }

  const stage = b.stage;
  // Epic cards run the epic lifecycle (analysis → decompose → integrating → done); stories run the
  // story lifecycle. Both share this engine; only the fan-in barrier (below) is epic-specific. §A3/§A4
  const cardType = b.card_type || 'story';
  const stagesCfg = (cardType === 'epic') ? (cfg.epic_stages || {}) : cfg.stages;
  const st = stagesCfg[stage];
  if (!st) return escalate(`unknown ${cardType} stage: ${stage}`);
  if (st.terminal) return mk('noop', `card is terminal (${stage})`);

  // 1. Termination backstop (dominates all thrash/cycle patterns). §B1.5
  const tb = cfg.budgets.transition_budget;
  if (b.counters && b.counters.transitions >= tb) {
    return escalate(`transition budget exceeded (${b.counters.transitions}/${tb})`);
  }
  const bounces = (b.counters && b.counters.bounces) || {};
  for (const edge of Object.keys(bounces)) {
    if (bounces[edge] >= cfg.budgets.bounce_limit) {
      return escalate(`bounce limit exceeded on ${edge} (${bounces[edge]}/${cfg.budgets.bounce_limit})`);
    }
  }

  // 1b. Out-of-band board DRIFT (#34): field/overlay/lease state that CONTRADICTS the comment-derived
  //     truth, which the handlers below would otherwise silently resolve — escalate (surface) instead.
  //     The recurring bug class this session: a `veto:held` overlay with no [VETO] (the engine would
  //     manufacture a clearance), `blocked` with no QUESTION (parks forever), a lease for a role that
  //     no longer owns the stage (an out-of-band move that didn't clear the lease).
  {
    const ov = b.overlays || {}, ad = b.advisors || {}, drift = [];
    if (ov.veto_held && !Object.values(ad).some((a) => a && (a.veto_open || a.veto_ever)))
      drift.push('veto:held overlay but no [VETO] was ever posted (set out-of-band)');
    if (ov.blocked && !b.open_question && !b.answer_pending_unblock)
      drift.push('blocked overlay but no open QUESTION (would park forever)');
    // NB: a lease.role != stage owner is NOT drift — a stale lease self-heals via expiry+reclaim
    // (lifecycle B1.2); escalating it here would fight that recovery.
    if (drift.length) return escalate('board drift (out-of-band state vs typed comments): ' + drift.join('; '));
  }

  // 2. Blocked overlay (parked). Unblock on answer; escalate on deadline; else noop. §A8 fail-closed
  if (b.overlays && b.overlays.blocked) {
    if (b.answer_pending_unblock) {
      return mk('unblock', 'answer received; resuming owner',
        [{ op: 'remove-label', label: 'blocked:needs-input' }, { op: 'update-pin' }]);
    }
    if (b.open_question && b.open_question.deadline_passed) {
      return escalate('decision deadline passed while blocked');
    }
    return mk('noop', 'parked: blocked awaiting input');
  }

  // 2b. VETO hold (parked by a security VETO). Cleared ONLY when an accountable human CLEARs it
  //     (the VETO carve-out: advisor flags, a human signs off — §A8). Like `blocked`, a held card
  //     stays in the ready set so this tick can detect the CLEAR; it just noops until then.
  if (b.overlays && b.overlays.veto_held) {
    const stillVetoed = b.advisors && Object.values(b.advisors).some((a) => a && a.veto_open);
    if (!stillVetoed) {
      return mk('veto-clear', 'security VETO cleared by accountable human; resuming',
        [{ op: 'remove-label', label: 'veto:held' }, { op: 'update-pin' }]);
    }
    return mk('noop', 'parked: held by security VETO awaiting accountable CLEAR');
  }

  // 2c. Risk gate (gh#41, OPT-IN via cfg.risk_gate_enabled — set from YD_RISK_GATE at the CLI; OFF by
  //     default so the live instance is unaffected). A high-risk card (R3/R4: hard-to-reverse + wide
  //     blast, or a boundary touch; MISSING/contradictory risk labels ⇒ R4 fail-closed) parks until an
  //     accountable human posts a [DECISION] risk:approved at the current epoch — the §A8 human-go.
  //     ORTHOGONAL to the advisor VETO (both clear independently). Like veto-held, the card stays tickable
  //     so this tick detects the DECISION; escalate once per epoch (risk.escalated), then noop.
  if (cfg.risk_gate_enabled && b.risk && (b.risk.tier === 'R3' || b.risk.tier === 'R4') && !b.risk.decision_approved) {
    if (!b.risk.escalated) {
      const ops = [];
      if (b.overlays && b.overlays.agent_running) ops.push({ op: 'clear-lease' });
      ops.push(post('ESCALATE', '@human',
        `Risk ${b.risk.tier} (reversible:${b.risk.reversible || '?'} · blast:${b.risk.blast || '?'} · boundary:${b.risk.boundary || '?'}${b.risk.missing_or_contradictory ? ' · labels missing/contradictory → fail-closed R4' : ''}) needs a human [DECISION] risk:approved before advancing (§A8).`,
        // epoch MUST be stamped: read-board's risk.escalated requires epochOf==cur, so without it the
        // gate would re-escalate every tick (notification storm). Carrying epoch also re-escalates
        // correctly after an epoch bump (re-spun high-risk work needs a fresh go).
        { cat: 'risk', kind: 'risk', epoch: b.current_epoch }));
      ops.push({ op: 'update-pin' });
      return mk('risk-gate', `risk ${b.risk.tier} — escalated @human, awaiting [DECISION] risk:approved`, ops);
    }
    return mk('noop', `risk ${b.risk.tier} — parked, awaiting human [DECISION] risk:approved`);
  }

  // 3. Open QUESTION not yet parked → block + route to cat: target. Park-don't-spin: drop
  //    the owner's lease so the worker is released while parked. §A7, §A4
  if (b.open_question && !b.open_question.answered) {
    const cat = b.open_question.cat || 'product';
    const ops = [{ op: 'add-label', label: 'blocked:needs-input' }];
    if (b.overlays && b.overlays.agent_running) ops.push({ op: 'clear-lease' });
    ops.push(post('ESCALATE', '@human', `Blocking question (cat:${cat}) needs an answer.`, { cat }));
    ops.push({ op: 'update-pin' });
    return mk('block', `routing QUESTION cat:${cat}`, ops);
  }

  const cur = b.current_epoch || 0;
  const comp = b.completion || { terminal: null, output_present: false };
  const lease = b.lease || { active: false };
  let advisorMiss = null;  // v0.3.13 (gh#25): set when an advisor joins here but its watch_paths match 0 changed files

  const advanceForward = (reason) => {
    const ops = [
      { op: 'set-stage', from: stage, to: st.next },
      { op: 'clear-lease' },
    ];
    // v0.3.6: the dev PR links the card with a NON-closing reference (`Refs #N`), so the card stays
    // OPEN through the pipeline; the engine closes the backing issue exactly ONCE — when it enters
    // the terminal stage (story production→done / epic integrating→done). Keyed off the SAME stage
    // map `st` came from (stagesCfg: story vs epic), so both tiers close correctly. §A4.
    const nextSt = stagesCfg[st.next];
    if (nextSt && nextSt.terminal) ops.push({ op: 'close-issue', reason: 'completed' });
    ops.push({ op: 'update-pin' });
    return mk('advance', reason, ops);
  };

  // Fan-in barrier (epic `integrating` stage): an epic advances only when ALL its child stories
  // are done — it spawns no worker, it waits. §A4 (fan-in), stress-test crack #4.
  if (st.gate === 'barrier') {
    const ch = b.children || { total: 0, done: 0 };
    const total = ch.total || 0, done = ch.done || 0;
    // v0.3.14 (#31): a barrier accrues no transitions, so the global budget can't catch a card parked
    // forever. An epic at `integrating` with ZERO children is anomalous (decompose produced none) —
    // escalate rather than noop 0/0 indefinitely.
    if (total === 0) return escalate(`fan-in barrier at ${stage} with 0 child stories (decompose produced none?) — escalating; the transition budget can't catch a barrier parked forever`);
    if (done >= total) return advanceForward(`fan-in: all ${total} child stories done`);
    return mk('noop', `fan-in barrier: ${done}/${total} child stories done`);
  }

  const advanceBackward = (to, reason) => mk('advance-backward', reason, [
    { op: 'set-stage', from: stage, to },
    { op: 'clear-lease' },
    { op: 'update-pin' },
  ]);
  const spawnOwner = (reason) => mk('spawn', reason, [
    { op: 'claim', role: st.owner_role, epoch: cur + 1, ttl: cfg.lease.ttl_seconds },
    { op: 'spawn', role: st.owner_role, epoch: cur + 1 },
    { op: 'update-pin' },
  ]);
  // Advisor diff-hook (§A5): if an advisor joins at this stage and a changed file matches its
  // watch_paths, it must review BEFORE the mechanical advance. An open VETO holds the card for an
  // accountable human CLEAR; an un-reviewed match dispatches the advisor; otherwise allow advance.
  const advisorGate = () => {
    const adv = (tp.advisors || []).find((a) => (a.joins_at || []).includes(stage));
    if (!adv) return null;
    const ast = (b.advisors && b.advisors[adv.role]) || {};
    const files = (b.pr && b.pr.changed_files) || [];
    // Content scanners (gh#39, opt-in): a hit forces this advisor to engage EVEN WHEN watch_paths missed
    // — the deep fix behind gh#25/#52 (path heuristics fail open; content matches don't). Empty/absent
    // unless YD_CHECKS_REGISTRY is set and a scanner is enabled, so the live instance is unaffected.
    const scannerHits = Array.isArray(b.pr && b.pr.scanner_hits) ? b.pr.scanner_hits : []; // tolerate a malformed non-array container
    const scannerMatch = scannerHits.some((h) => h && h.matched === true);
    const watchMatched = watchMatch(files, adv.watch_paths || []);
    // An already-open VETO/HOLD must be honored regardless of the PR's CURRENT changed_files (the
    // file list is LIVE; a later commit can drift it below watch_paths — must NOT silently drop an
    // open hold/veto, v0.3.7/v0.3.8). watch_paths OR a scanner hit gates the INITIAL dispatch below.
    if (!ast.veto_open && !ast.hold_open && !watchMatched && !scannerMatch) {
      // v0.3.13 (gh#25): the advisor joins at this stage but matched ZERO of the PR's changed files
      // AND no content scanner fired. If the PR DID change files and the advisor never reviewed, that
      // may be a FAIL-OPEN (globs not covering the real layout). Surface it in the advance reason so it
      // isn't silent — the static `check-watch-paths` validator + the gh#39 scanners are the prevention.
      if (files.length > 0 && !ast.reviewed_at_epoch) {
        advisorMiss = `${adv.role} matched 0/${files.length} changed files — watch_paths may miss this PR (gh#25)`;
      }
      return null;
    }
    if (ast.veto_open) {
      const ops = [{ op: 'add-label', label: 'veto:held' }];
      if (b.overlays && b.overlays.agent_running) ops.push({ op: 'clear-lease' });
      ops.push(post('ESCALATE', '@human',
        `Security VETO on #${card} must be CLEARed by an accountable human before merge.`, { cat: 'security' }));
      ops.push({ op: 'update-pin' });
      return mk('veto-hold', `${adv.role} VETO open — needs accountable CLEAR`, ops);
    }
    // HOLD (v0.3.7): a non-binding park for a human compliance sign-off (Spam-Act/opt-out, privacy
    // lawful-basis, consent…) — NOT a boundary violation, but a must-confirm finding the advisor must
    // NOT downgrade to plain ADVICE. Blocks the forward advance until a human CLEAR/ACK. The first
    // tick escalates @human once (kind:hold); later ticks park silently (hold_escalated). Fixes the
    // bug where a "human must confirm before merge" finding posted as ADVICE let the card advance.
    if (ast.hold_open) {
      if (!ast.hold_escalated) {
        const ops = [];
        if (b.overlays && b.overlays.agent_running) ops.push({ op: 'clear-lease' });
        ops.push(post('ESCALATE', '@human',
          `Security HOLD on #${card}: a human compliance sign-off (CLEAR/ACK) is required before this advances — the code may work, but a must-confirm finding stands. NOT a boundary violation.`,
          { cat: 'security', kind: 'hold' }));
        ops.push({ op: 'update-pin' });
        return mk('advisor-hold', `${adv.role} HOLD open — escalated @human, awaiting CLEAR/ACK`, ops);
      }
      return mk('noop', `${adv.role} HOLD open — parked, awaiting human CLEAR/ACK`);
    }
    // v0.3.17 (#33): a verdict only covers the PR HEAD SHA it reviewed. If the head advanced since
    // (a fix pushed after ADVICE, or after a VETO/HOLD was CLEARed), the review is stale → re-dispatch
    // the advisor on the new head rather than advance code it never saw. Lenient when either SHA is
    // absent — no PR head, or an older advisor that doesn't echo `sha:` — falls back to prior behavior
    // (reviewed → advance). `indexOf===0` so a short echoed SHA prefix-matches the full head OID.
    let reReview = false;
    if (ast.reviewed_at_epoch) {
      const head = (b.pr && b.pr.head) || null;
      const seen = ast.reviewed_head || null;
      if (!head || !seen || head.indexOf(seen) === 0) return null; // reviewed THIS head → advance
      reReview = true; // head moved past the reviewed SHA → fall through to re-dispatch
    }
    // The advisor is already dispatched and still working — wait, don't re-spawn it. Without this,
    // mechanical() (which runs before the lease check) would re-claim the advisor every tick.
    if (lease.active && lease.role === adv.role && !leaseExpired(b, cfg)) {
      return mk('noop', `${adv.role} reviewing (lease held @${cur})`);
    }
    // Dispatch reason reflects HOW the advisor was engaged: watch_paths match, or a content scanner hit
    // when watch_paths missed (gh#39) — so the breadcrumb shows the backstop fired.
    const scannerIds = scannerHits.filter((h) => h && h.matched).map((h) => h.scanner_id).join(', ');
    const dispatchReason = reReview
      ? `re-dispatch ${adv.role}: PR head moved past reviewed SHA ${ast.reviewed_head} (gh#33)`
      : watchMatched
        ? `dispatch ${adv.role} (watch_paths match)`
        : `dispatch ${adv.role} (content scanner: ${scannerIds} — watch_paths missed, gh#39)`;
    return mk('spawn-advisor', dispatchReason, [
      { op: 'claim', role: adv.role, epoch: cur + 1, ttl: cfg.lease.ttl_seconds },
      { op: 'spawn', role: adv.role, epoch: cur + 1 },
      { op: 'update-pin' },
    ]);
  };

  // Shared mechanical-gate decision (used by both the terminal-MOVE and output-present paths
  // so they cannot drift). A failing check never double-spawns a worker that still holds a
  // valid, unexpired lease; an absent check is fail-closed (no advance).
  // gh#56: if a post-verdict commit moved the PR head past an advisor's reviewed SHA, the advisor will
  // re-review (gh#33) — but only once the check goes green. Annotate the check-pending/absent noop so it
  // reads as "waiting for fresh CI before re-review", not "stuck". Reason-string only — no behavior change.
  const reReviewSuffix = () => {
    const head = b.pr && b.pr.head;
    if (!head) return '';
    for (const a of Object.values(b.advisors || {})) {
      if (a && a.reviewed_at_epoch && a.reviewed_head && head.indexOf(a.reviewed_head) !== 0)
        return ` — head moved past reviewed sha:${a.reviewed_head}; advisor re-reviews once ${st.advance_on} is green (gh#33)`;
    }
    return '';
  };
  const mechanical = (ctx) => {
    const g = gateStatus(b, st.advance_on);
    if (g === 'success') { const v = advisorGate(); if (v) return v; return advanceForward(`${ctx}; ${st.advance_on}=success${advisorMiss ? ` · ${advisorMiss}` : ''}`); }
    if (g === 'pending') return mk('noop', `${ctx}; ${st.advance_on} pending${reReviewSuffix()}`);
    if (g === 'failure') {
      if (lease.active && !leaseExpired(b, cfg)) return mk('noop', `${st.advance_on} failed; worker still holds lease`);
      return spawnOwner(`${st.advance_on} failed; re-spawn ${st.owner_role} to fix`);
    }
    return mk('noop', `${ctx}; required check ${st.advance_on} absent (fail-closed)${reReviewSuffix()}`);
  };

  // 4. Apply a terminal act ONLY if it is at the current epoch (fencing). §B1.2
  //    A stale-epoch MOVE/REJECT is ignored — read-board sets completion.terminal=null for it.
  const term = comp.terminal;
  // gh#63: an instance that renames a stage (lifecycle.overrides) makes a core agent template's
  // hard-coded `from-stage:` literal differ from the card's real stage. read-board canonicalizes
  // completion.terminal.from to the actual stage (so the guard below holds) and preserves the raw
  // token as `from_label`; surface the mismatch as a non-blocking breadcrumb — tolerated, not silent.
  const labelWarn = (term && term.from_label && term.from_label !== stage)
    ? ` · ⚠ worker labeled from-stage:${term.from_label} but stage is ${stage} (renamed stage — tolerated, gh#63)`
    : '';
  if (term && term.epoch === cur && term.from === stage) {
    if (term.by === 'REJECT') {
      // Only honor a REJECT that names a defined backward edge; else escalate (no illegal write).
      const edges = cfg.backward_edges || {};
      if (!term.to || !edges[`${stage}->${term.to}`]) {
        return escalate(`REJECT on undefined backward edge ${stage}->${term.to}`);
      }
      return advanceBackward(term.to, `REJECT at epoch ${cur}: ${stage} → ${term.to}${labelWarn}`);
    }
    // forward MOVE
    if (st.gate === 'judgement') {
      // v0.3.14 (#30): a judgement gate has exactly ONE forward target (st.next); a MOVE naming any
      // other to-stage is illegal/ambiguous — escalate rather than silently land in st.next (symmetry
      // with the backward-edge REJECT guard above).
      if (term.to && term.to !== st.next) {
        return escalate(`MOVE names to-stage:${term.to} but ${stage}'s only forward edge is →${st.next}`);
      }
      return advanceForward(`judgement gate met (MOVE at epoch ${cur})${labelWarn}`);
    }
    // mechanical: a MOVE alone is not enough — the named check must be green
    return mechanical(`MOVE present at epoch ${cur}${labelWarn}`);
  }

  // 5. Mechanical stage where completion is OUTPUT (worker NOTE / linked PR), not a MOVE. §B1.2 row guard
  if (st.gate === 'mechanical' && comp.output_present) {
    return mechanical('output present');
  }

  // 6. Lease held but no usable completion: wait, or reclaim if expired. §B1.2 row 3
  //    Reclaim spawns the role the CURRENT stage owns (not lease.role, which could be stale).
  if (lease.active) {
    if (leaseExpired(b, cfg)) {
      return mk('reclaim', `lease expired (epoch ${cur}); bump epoch + re-spawn`, [
        { op: 'claim', role: st.owner_role, epoch: cur + 1, ttl: cfg.lease.ttl_seconds },
        { op: 'spawn', role: st.owner_role, epoch: cur + 1 },
        { op: 'update-pin' },
      ]);
    }
    return mk('noop', 'worker holds a valid lease; awaiting output');
  }

  // 7. No lease, not terminal, nothing pending → spawn the stage owner. §B1.2 row 4
  return spawnOwner(`spawn ${st.owner_role} for stage:${stage}`);
}

function leaseExpired(b, cfg) {
  const lease = b.lease || {};
  if (!lease.active) return false;
  // An ACTIVE lease with a missing/unparseable anchor or clock fails CLOSED → reclaim,
  // rather than stranding a card forever (epoch fencing makes an early reclaim safe).
  if (!lease.started_at || !b.now) return true;
  const started = Date.parse(lease.started_at);
  const now = Date.parse(b.now);
  if (Number.isNaN(started) || Number.isNaN(now)) return true;
  const skew = Number(cfg.lease.skew_guard_seconds) || 0;
  const ttl = (Number(lease.ttl) || cfg.lease.ttl_seconds) + skew;
  return (now - started) / 1000 > ttl;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);
  let boardPath = null, cfgPath = path.join(__dirname, 'lifecycle.mvp.json');
  let tpPath = path.join(__dirname, 'team-policy.mvp.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') cfgPath = args[++i];
    else if (args[i] === '--team-policy') tpPath = args[++i];
    else boardPath = args[i];
  }
  const raw = boardPath ? fs.readFileSync(boardPath, 'utf8') : fs.readFileSync(0, 'utf8');
  const board = JSON.parse(raw);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  // gh#41: env opt-in at the boundary keeps decide() pure (it reads cfg, not process.env). OFF by default.
  cfg.risk_gate_enabled = process.env.YD_RISK_GATE === '1';
  let tp = { advisors: [] };
  try { tp = JSON.parse(fs.readFileSync(tpPath, 'utf8')); } catch (e) { /* no advisors */ }
  process.stdout.write(JSON.stringify(decide(board, cfg, tp), null, 2) + '\n');
}

module.exports = { decide, leaseExpired, watchMatch, globToRegExp };
