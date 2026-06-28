import { execFile } from "child_process";
import { promisify } from "util";
import type { CheckRollup, GhIssue, GhLinkedPr, GitHubApi } from "./github-api.js";

export type GhExec = (args: string[]) => Promise<string>;

const _execFile = promisify(execFile);

const defaultExec: GhExec = async (args) => {
  const { stdout } = await _execFile("gh", args, { encoding: "utf8" });
  return stdout;
};

interface RawIssue {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
  state: string;
}

function mapIssue(raw: RawIssue): GhIssue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    labels: raw.labels.map((l) => l.name),
    state: raw.state.toLowerCase() as "open" | "closed",
  };
}

const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"]);
const SUCCESS_CONCLUSION = "success";

const CROSS_REF_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 25) {
        nodes {
          ... on CrossReferencedEvent {
            source {
              ... on PullRequest {
                number
                state
                headRefOid
              }
            }
          }
        }
      }
    }
  }
}
`.trim();

export class GhCliGitHubApi implements GitHubApi {
  private readonly exec: GhExec;

  constructor(private readonly repo: string, exec?: GhExec) {
    this.exec = exec ?? defaultExec;
  }

  async listIssues(opts: { labels?: string[]; state?: "open" | "closed" }): Promise<GhIssue[]> {
    const args = [
      "issue", "list", "-R", this.repo,
      "--json", "number,title,body,labels,state",
      "--limit", "200",
      ...(opts.state ? ["--state", opts.state] : []),
      ...(opts.labels?.flatMap((l) => ["--label", l]) ?? []),
    ];
    const out = await this.exec(args);
    const raw: RawIssue[] = JSON.parse(out);
    return raw.map(mapIssue);
  }

  async getIssue(num: number): Promise<GhIssue | null> {
    try {
      const out = await this.exec([
        "issue", "view", String(num), "-R", this.repo,
        "--json", "number,title,body,labels,state",
      ]);
      return mapIssue(JSON.parse(out) as RawIssue);
    } catch {
      return null;
    }
  }

  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<GhIssue> {
    const args = [
      "issue", "create", "-R", this.repo,
      "--title", opts.title,
      "--body", opts.body,
      ...(opts.labels?.flatMap((l) => ["--label", l]) ?? []),
    ];
    const url = (await this.exec(args)).trim();
    const match = url.match(/\/issues\/(\d+)/);
    if (!match) throw new Error(`could not parse issue number from: ${url}`);
    const num = parseInt(match[1], 10);
    return (await this.getIssue(num))!;
  }

  async setLabels(num: number, add: string[], remove: string[]): Promise<void> {
    if (add.length === 0 && remove.length === 0) return;
    await this.exec([
      "issue", "edit", String(num), "-R", this.repo,
      ...add.flatMap((l) => ["--add-label", l]),
      ...remove.flatMap((l) => ["--remove-label", l]),
    ]);
  }

  async setState(num: number, state: "open" | "closed"): Promise<void> {
    const sub = state === "closed" ? "close" : "reopen";
    await this.exec(["issue", sub, String(num), "-R", this.repo]);
  }

  async updateBody(num: number, body: string): Promise<void> {
    await this.exec(["issue", "edit", String(num), "-R", this.repo, "--body", body]);
  }

  async comment(num: number, body: string): Promise<void> {
    await this.exec(["issue", "comment", String(num), "-R", this.repo, "--body", body]);
  }

  async listComments(num: number): Promise<{ body: string }[]> {
    const out = await this.exec([
      "issue", "view", String(num), "-R", this.repo, "--json", "comments",
    ]);
    const parsed = JSON.parse(out) as { comments: { body: string }[] };
    return parsed.comments;
  }

  async resolveLinkedPr(issueNum: number): Promise<GhLinkedPr | null> {
    const slash = this.repo.indexOf("/");
    const owner = this.repo.slice(0, slash);
    const name = this.repo.slice(slash + 1);

    const gqlOut = await this.exec([
      "api", "graphql",
      "-f", `query=${CROSS_REF_QUERY}`,
      "-F", `owner=${owner}`,
      "-F", `name=${name}`,
      "-F", `number=${issueNum}`,
    ]);

    const data = JSON.parse(gqlOut) as {
      data?: {
        repository?: {
          issue?: {
            timelineItems?: {
              nodes?: { source?: { number?: number; state?: string; headRefOid?: string } }[];
            };
          };
        };
      };
    };

    const nodes = data?.data?.repository?.issue?.timelineItems?.nodes ?? [];
    const prs = nodes
      .map((n) => n.source)
      .filter(
        (s): s is { number: number; state: string; headRefOid: string } =>
          typeof s?.number === "number" &&
          (s.state === "OPEN" || s.state === "MERGED"),
      );

    if (prs.length !== 1) return null;

    const pr = prs[0];
    const prOut = await this.exec([
      "pr", "view", String(pr.number), "-R", this.repo,
      "--json", "number,headRefOid,files",
    ]);
    const prData = JSON.parse(prOut) as {
      number: number;
      headRefOid: string;
      files: { path: string }[];
    };

    return {
      number: prData.number,
      head: prData.headRefOid,
      files: prData.files.map((f) => f.path),
    };
  }

  async getCheckRollup(head: string): Promise<CheckRollup> {
    const out = await this.exec([
      "api", `repos/${this.repo}/commits/${head}/check-runs`,
      "--jq", ".check_runs | map(.conclusion // .status)",
    ]);
    const conclusions: (string | null)[] = JSON.parse(out);

    if (conclusions.length === 0) return "absent";
    if (conclusions.some((c) => c !== null && FAILURE_CONCLUSIONS.has(c))) return "failure";
    if (conclusions.some((c) => c === null || c !== SUCCESS_CONCLUSION)) return "pending";
    return "success";
  }
}
