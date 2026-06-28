// The thin GitHub surface the GitHub adaptor depends on. PURE GitHub primitives — no knowledge of
// CanonicalCard/Op/the logical-id stamp/the lease pin (those live in the adaptor, P3b).
export type CheckRollup = "success" | "pending" | "failure" | "absent";

export interface GhIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
}

export interface GhLinkedPr {
  number: number;
  head: string;
  files: string[];
}

export interface GitHubApi {
  // ── ticket plane ──
  listIssues(opts: { labels?: string[]; state?: "open" | "closed" }): Promise<GhIssue[]>;
  getIssue(num: number): Promise<GhIssue | null>;
  createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<GhIssue>;
  setLabels(num: number, add: string[], remove: string[]): Promise<void>;
  setState(num: number, state: "open" | "closed"): Promise<void>;
  updateBody(num: number, body: string): Promise<void>;
  comment(num: number, body: string): Promise<void>;
  listComments(num: number): Promise<{ body: string }[]>;
  // ── VCS/CI plane (read-only) ──
  resolveLinkedPr(issueNum: number): Promise<GhLinkedPr | null>;
  getCheckRollup(head: string): Promise<CheckRollup>;
}
