# yarradev

Open-source agentic-SDLC orchestrator. Drives a work board through a gated lifecycle
(design → dev → test → done …) by dispatching role agents. Backend-agnostic:

- **GitHub** (Issues/Projects) — the free default.
- **yarradev.ai platform** — the subscription backend.

The orchestrator is authoritative; backends are stores behind a typed `BoardBackend` adaptor.
See `docs/` for the architecture.

## CLI (`bin/yarradev`)

The `@yarradev/cli` package ships a `yarradev` binary with five commands:

| Command | Description |
|---|---|
| `list-ready` | Print ready cards as JSON |
| `read-card <id> <stage> [story\|epic]` | Read and print a card |
| `decide <id> <stage> [story\|epic]` | Run `decide()` and print the decision |
| `reduce <id> <stage> <verdictJson> [story\|epic]` | Run `reduceVerdict()` and print ops |
| `run-pass [--dry-run]` | Run one read-only pass of the orchestration loop |

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `YD_BACKEND` | `github` | Backend adaptor to use (`github` only in this build) |
| `YD_REPO` | _required for `github`_ | `<owner>/<name>` of the GitHub repo |
| `YD_LIFECYCLE` | `config/lifecycle.json` | Path to the lifecycle config file |
| `YD_TEAM_POLICY` | `config/team-policy.json` | Path to the team-policy config file (optional) |

**Worked example:**

```bash
YD_BACKEND=github YD_REPO=acme/x yarradev run-pass --dry-run
```

This loads `config/lifecycle.json` and `config/team-policy.json`, prints any inert-advisor startup warnings to stderr, runs one read-only pass (`runPass` with `dryRun: true`), and prints the `PassReport` JSON to stdout. No state is written to the backend.

**Note:** The production agent dispatcher ships later as the `yarradev-run` skill. The `Dispatcher` seam is already in `@yarradev/core` for testing — use `run-pass --dry-run` for read-only loop inspection until the dispatcher is wired.
