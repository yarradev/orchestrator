import { runBoardBackendContract } from "@yarradev/core/testing";
import { GitHubAdaptor } from "../src/github-adaptor.js";
import { InMemoryGitHubApi } from "../src/testing/in-memory-github-api.js";
import { makeCanonicalCard } from "@yarradev/core";

runBoardBackendContract({
  name: "GitHubAdaptor + InMemoryGitHubApi",
  make: () => new GitHubAdaptor(new InMemoryGitHubApi()),
  seed: async (b, card) => { await (b as GitHubAdaptor).seedCard(card); },
  card: (over) => makeCanonicalCard(over),
});
