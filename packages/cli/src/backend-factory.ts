import { GitHubAdaptor, GhCliGitHubApi } from "@yarradev/adaptor-github";
import { BoardAdaptor } from "@yarradev/adaptor-board";
import type { BoardBackend } from "@yarradev/core";

/** Minimal fetch-based HTTP client satisfying the BoardClient interface BoardAdaptor consumes. */
class HttpBoardClient {
  constructor(private opts: { apiBase: string; doName: string; token: string }) {}
  private url(suffix: string) { return `${this.opts.apiBase}/boards/${encodeURIComponent(this.opts.doName)}${suffix}`; }
  private headers() { return { "content-type": "application/json", Authorization: `Bearer ${this.opts.token}` }; }
  async listCards(opts: { state?: string; stages?: string[]; excludeOverlays?: string[] } = {}): Promise<{ id: string; stage: string }[]> {
    const qs = new URLSearchParams();
    if (opts.stages) qs.set("stages", opts.stages.join(","));
    const res = await fetch(`${this.url("/cards?limit=200")}&${qs.toString()}`, { headers: this.headers() });
    const body = await res.json() as { items?: { id: string; state: string }[] };
    return (body.items ?? []).map((i) => ({ id: i.id, stage: i.state }));
  }
  async readEnriched(id: string) {
    const res = await fetch(this.url(`/cards/${encodeURIComponent(id)}/enriched`), { headers: this.headers() });
    return res.json();
  }
  async submitActs(_acts: unknown[]) { throw new Error("submitActs not implemented for read-only dry-run"); }
}

export function selectBackend(env: Record<string, string | undefined>): BoardBackend {
  const kind = env.YD_BACKEND ?? "github";
  if (kind === "github") {
    const repo = env.YD_REPO;
    if (!repo) throw new Error("YD_BACKEND=github requires YD_REPO=<owner>/<name>");
    return new GitHubAdaptor(new GhCliGitHubApi(repo));
  }
  if (kind === "board") {
    const apiBase = env.YDB_API_BASE;
    const doName = env.YDB_DO_NAME;
    if (!apiBase || !doName) throw new Error("YD_BACKEND=board requires YDB_API_BASE and YDB_DO_NAME");
    const token = env.YDB_TOKEN_ORCHESTRATOR ?? env.YDB_TOKEN ?? "";
    if (!token) throw new Error("YD_BACKEND=board requires YDB_TOKEN_ORCHESTRATOR or YDB_TOKEN");
    const client = new HttpBoardClient({ apiBase, doName, token });
    return new BoardAdaptor(client);
  }
  throw new Error(`unknown YD_BACKEND: ${kind} (supported: github, board)`);
}
