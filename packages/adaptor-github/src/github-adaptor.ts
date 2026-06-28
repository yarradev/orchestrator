import type {
  BoardBackend,
  CanonicalCard,
  CardRef,
  ReadyFilter,
  Op,
  Fence,
  ApplyResult,
  OpResult,
  Lease,
  GateStatus,
  BackendCapabilities,
} from "@yarradev/core";
import type { GitHubApi, GhIssue, CheckRollup } from "./github-api.js";
import {
  stageLabel,
  parseStage,
  typeLabel,
  parseType,
  OVERLAY_LABELS,
  parseOverlays,
  idMarker,
  parseId,
  parseLease,
  setLease,
  noteMarker,
  hasNote,
  parseCounters,
  setCounters,
} from "./conventions.js";

export class GitHubAdaptor implements BoardBackend {
  readonly capabilities: BackendCapabilities = {
    ci: "pull",
    fencing: "orchestrator",
    prDiff: true,
    projectsView: false,
    richComments: true,
    assignees: true,
    milestones: true,
  };

  private readonly now: () => number;

  constructor(private readonly api: GitHubApi, opts?: { now?: () => number }) {
    this.now = opts?.now ?? (() => Date.now());
  }

  private async resolve(id: string): Promise<GhIssue | null> {
    const issues = await this.api.listIssues({ state: "all" });
    return issues.find((i) => parseId(i.body) === id) ?? null;
  }

  private mapRollup(r: CheckRollup): GateStatus {
    return r;
  }

  async readCard(ref: CardRef): Promise<CanonicalCard> {
    const issue = await this.resolve(ref.id);
    if (!issue) throw new Error(`card not found: ${ref.id}`);

    const { labels, body } = issue;
    const overlays = parseOverlays(labels);
    const pr = await this.api.resolveLinkedPr(issue.number);
    const ci: GateStatus = pr
      ? this.mapRollup(await this.api.getCheckRollup(pr.head))
      : "absent";

    return {
      id: ref.id,
      type: parseType(labels),
      stage: parseStage(labels) ?? ref.stage,
      state: issue.state,
      overlays,
      lease: parseLease(body),
      pr,
      checks: { ci },
      advisors: {},
      counters: parseCounters(body),
      questions: { open: overlays.includes("blocked") ? 1 : 0 },
      title: issue.title,
      parentId: null,
    };
  }

  async listReady(filter: ReadyFilter): Promise<CardRef[]> {
    const issues = await this.api.listIssues({ state: "open" });
    const refs: CardRef[] = [];
    for (const issue of issues) {
      const id = parseId(issue.body);
      if (!id) continue;
      const stage = parseStage(issue.labels);
      if (filter.stages) {
        if (!stage || !filter.stages.includes(stage)) continue;
      }
      const overlays = parseOverlays(issue.labels);
      if (filter.excludeOverlays?.some((o) => overlays.includes(o))) continue;
      refs.push({ id, stage: stage ?? "", type: parseType(issue.labels) });
    }
    return refs.sort((a, b) => a.id.localeCompare(b.id));
  }

  async applyOps(ref: CardRef, ops: Op[], fence: Fence): Promise<ApplyResult> {
    const issue = await this.resolve(ref.id);
    if (!issue) throw new Error(`card not found: ${ref.id}`);

    const work = {
      number: issue.number,
      labels: [...issue.labels],
      body: issue.body,
      state: issue.state,
    };
    const counters = parseCounters(work.body);
    const results: OpResult[] = [];

    for (const op of ops) {
      // Fence gate — all ops except claim
      if (op.kind !== "claim") {
        const live = parseLease(work.body);
        if (live && live.expiresAt > this.now() && fence.epoch !== live.epoch) {
          results.push({ op, outcome: "fenced", reason: "stale epoch" });
          continue;
        }
      }

      switch (op.kind) {
        case "claim": {
          const live = parseLease(work.body);
          if (live && live.expiresAt > this.now()) {
            results.push({ op, outcome: "fenced", reason: "already leased" });
          } else {
            const lease: Lease = {
              epoch: op.epoch,
              holder: fence.holder,
              role: op.role,
              expiresAt: this.now() + op.ttlS * 1000,
            };
            work.body = setLease(work.body, lease);
            await this.api.updateBody(work.number, work.body);
            results.push({ op, outcome: "committed" });
          }
          break;
        }

        case "clearLease": {
          work.body = setLease(work.body, null);
          await this.api.updateBody(work.number, work.body);
          results.push({ op, outcome: "committed" });
          break;
        }

        case "setStage": {
          if (parseStage(work.labels) !== op.from) {
            results.push({ op, outcome: "fenced" });
          } else {
            await this.api.setLabels(work.number, [stageLabel(op.to)], [stageLabel(op.from)]);
            work.labels = work.labels.filter((l) => l !== stageLabel(op.from));
            work.labels.push(stageLabel(op.to));
            counters.transitions += 1;
            work.body = setCounters(work.body, counters);
            await this.api.updateBody(work.number, work.body);
            results.push({ op, outcome: "committed" });
          }
          break;
        }

        case "reject": {
          if (parseStage(work.labels) !== op.from) {
            results.push({ op, outcome: "fenced" });
          } else {
            await this.api.setLabels(work.number, [stageLabel(op.to)], [stageLabel(op.from)]);
            work.labels = work.labels.filter((l) => l !== stageLabel(op.from));
            work.labels.push(stageLabel(op.to));
            counters.transitions += 1;
            counters.bounces[op.edge] = (counters.bounces[op.edge] ?? 0) + 1;
            work.body = setCounters(work.body, counters);
            await this.api.updateBody(work.number, work.body);
            results.push({ op, outcome: "committed" });
          }
          break;
        }

        case "setOverlay": {
          const add = op.on ? [OVERLAY_LABELS[op.overlay]] : [];
          const rem = op.on ? [] : [OVERLAY_LABELS[op.overlay]];
          await this.api.setLabels(work.number, add, rem);
          if (op.on) {
            if (!work.labels.includes(OVERLAY_LABELS[op.overlay])) {
              work.labels.push(OVERLAY_LABELS[op.overlay]);
            }
          } else {
            work.labels = work.labels.filter((l) => l !== OVERLAY_LABELS[op.overlay]);
          }
          results.push({ op, outcome: "committed" });
          break;
        }

        case "note": {
          const cs = (await this.api.listComments(work.number)).map((c) => c.body);
          if (hasNote(cs, op.key)) {
            results.push({ op, outcome: "committed" });
          } else {
            await this.api.comment(work.number, noteMarker(op.key) + "\n" + op.body);
            results.push({ op, outcome: "committed" });
          }
          break;
        }

        case "close": {
          if (parseStage(work.labels) !== op.from) {
            results.push({ op, outcome: "fenced" });
          } else {
            await this.api.setState(work.number, "closed");
            work.state = "closed";
            results.push({ op, outcome: "committed" });
          }
          break;
        }

        case "veto":
        case "clearVeto": {
          results.push({ op, outcome: "unsupported", reason: "governance ops deferred (P2)" });
          break;
        }

        default: {
          results.push({ op, outcome: "unsupported" });
          break;
        }
      }
    }

    return { ok: results.every((r) => r.outcome === "committed"), results };
  }

  /** Test helper — not part of BoardBackend. Creates the GitHub issue representing `card`. */
  async seedCard(card: CanonicalCard): Promise<void> {
    let body = idMarker(card.id);
    if (card.lease) {
      body = setLease(body, card.lease);
    }
    const labels = [
      stageLabel(card.stage),
      typeLabel(card.type),
      ...card.overlays.map((o) => OVERLAY_LABELS[o]),
    ];
    await this.api.createIssue({ title: card.title, body, labels });
  }
}
