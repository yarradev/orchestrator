import { GitHubAdaptor, GhCliGitHubApi } from "@yarradev/adaptor-github";
import type { BoardBackend } from "@yarradev/core";

export function selectBackend(env: Record<string, string | undefined>): BoardBackend {
  const kind = env.YD_BACKEND ?? "github";
  if (kind === "github") {
    const repo = env.YD_REPO;
    if (!repo) throw new Error("YD_BACKEND=github requires YD_REPO=<owner>/<name>");
    return new GitHubAdaptor(new GhCliGitHubApi(repo));
  }
  throw new Error(`unknown YD_BACKEND: ${kind} (supported: github)`);
}
