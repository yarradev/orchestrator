# yarradev

Open-source agentic-SDLC orchestrator. Drives a work board through a gated lifecycle
(design → dev → test → done …) by dispatching role agents. Backend-agnostic:

- **GitHub** (Issues/Projects) — the free default.
- **yarradev.ai platform** — the subscription backend.

The orchestrator is authoritative; backends are stores behind a typed `BoardBackend` adaptor.
See `docs/` for the architecture.
