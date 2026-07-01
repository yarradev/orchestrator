import { GitHubAdaptor, GhCliGitHubApi } from "@yarradev/adaptor-github";
import { BoardAdaptor } from "@yarradev/adaptor-board";
import { BoardClient } from "@yarradev/board-client";
import type { BoardBackend } from "@yarradev/core";

function newBoardClient(apiBase: string, doName: string, token: string): BoardClient {
  return new BoardClient({ apiBase, boardName: doName, token });
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
    return new BoardAdaptor(newBoardClient(apiBase, doName, token));
  }
  throw new Error(`unknown YD_BACKEND: ${kind} (supported: github, board)`);
}
