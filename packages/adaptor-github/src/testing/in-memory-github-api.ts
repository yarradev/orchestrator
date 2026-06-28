import type { CheckRollup, GhIssue, GhLinkedPr, GitHubApi } from "../github-api.js";

/** Deterministic in-memory GitHubApi for contract + unit tests. No clocks, no network. */
export class InMemoryGitHubApi implements GitHubApi {
  private issues = new Map<number, GhIssue>();
  private comments = new Map<number, { body: string }[]>();
  private prs = new Map<number, GhLinkedPr>();      // issueNumber -> linked PR
  private rollups = new Map<string, CheckRollup>(); // head sha -> rollup
  private seq = 0;

  async listIssues(opts: { labels?: string[]; state?: "open" | "closed" }): Promise<GhIssue[]> {
    const out: GhIssue[] = [];
    for (const i of this.issues.values()) {
      if (opts.state && i.state !== opts.state) continue;
      if (opts.labels && !opts.labels.every((l) => i.labels.includes(l))) continue;
      out.push(structuredClone(i));
    }
    return out.sort((a, b) => a.number - b.number);
  }

  async getIssue(num: number): Promise<GhIssue | null> {
    const i = this.issues.get(num);
    return i ? structuredClone(i) : null;
  }

  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<GhIssue> {
    const issue: GhIssue = {
      number: ++this.seq,
      title: opts.title,
      body: opts.body,
      labels: [...(opts.labels ?? [])],
      state: "open",
    };
    this.issues.set(issue.number, issue);
    return structuredClone(issue);
  }

  async setLabels(num: number, add: string[], remove: string[]): Promise<void> {
    const i = this.must(num);
    const set = new Set(i.labels);
    for (const l of remove) set.delete(l);
    for (const l of add) set.add(l);
    i.labels = [...set];
  }

  async setState(num: number, state: "open" | "closed"): Promise<void> {
    this.must(num).state = state;
  }

  async updateBody(num: number, body: string): Promise<void> {
    this.must(num).body = body;
  }

  async comment(num: number, body: string): Promise<void> {
    this.must(num);
    const list = this.comments.get(num) ?? [];
    list.push({ body });
    this.comments.set(num, list);
  }

  async listComments(num: number): Promise<{ body: string }[]> {
    this.must(num);
    return (this.comments.get(num) ?? []).map((c) => ({ ...c }));
  }

  async resolveLinkedPr(issueNum: number): Promise<GhLinkedPr | null> {
    const pr = this.prs.get(issueNum);
    return pr ? structuredClone(pr) : null;
  }

  async getCheckRollup(head: string): Promise<CheckRollup> {
    return this.rollups.get(head) ?? "absent";
  }

  // ── test fixtures (not part of GitHubApi) ──
  setLinkedPr(issueNum: number, pr: GhLinkedPr): void {
    this.prs.set(issueNum, structuredClone(pr));
  }
  setCheckRollup(head: string, rollup: CheckRollup): void {
    this.rollups.set(head, rollup);
  }

  private must(num: number): GhIssue {
    const i = this.issues.get(num);
    if (!i) throw new Error(`no such issue: #${num}`);
    return i;
  }
}
