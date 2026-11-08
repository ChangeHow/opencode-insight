# Publication review

Reviewed the working tree based on `58217b5` and all 203 locally reachable commits before changing repository visibility. No commits were rewritten, no credentials were rotated, and repository visibility was not changed.

# Decisions before publication

## Git history still contains redacted metadata

Current files no longer contain the identified personal paths, private deployment URL, or D1 instance ID. Older commits still do:

- `ADD_MACHINE.md`: deployment URL and personal workspace path, including `ac6bf7b` and `5ac3604`.
- `workers/sync/wrangler.jsonc`: D1 instance ID, including `701e6d9` and `ac6bf7b`.
- Test fixtures: personal workspace paths, including `a93576f`, `2d1cdaa`, `d599b56`, and `ce0bc19`.
- `docs/insight-memory-experiments.md`: machine-specific temporary output path in `ce0bc19`.

These identifiers are not authentication credentials. Nevertheless, publishing existing history will expose them. Decide whether that metadata is acceptable or whether to publish sanitized history/a clean repository. Rewriting shared history and force-pushing require separate authorization; this work does neither. Remote-only or deleted objects, pull-request attachments, releases, and existing npm artifacts are outside this local scan.

## Project license is not defined

The original README claimed MIT, but the repository contains no root `LICENSE`. Confirm the intended license and copyright holder before advertising a license or publishing an open-source release. Public visibility alone does not grant reuse rights.

Commit `928cac8` explicitly records vendoring AgentPrism UI and data utilities. Its [upstream MIT license](https://github.com/evilmartians/agent-prism/blob/main/LICENSE) is now preserved in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), which is included in the npm package file list. This does not choose a license for this project's own code.

# Deployment boundary

The dashboard BFF has no authentication and enables permissive API CORS (`apps/bff/src/app.ts`). Its message API can return user/assistant text, reasoning, and tool input/output (`apps/bff/src/controllers/messages.ts`, `apps/bff/src/services/messages.ts`). Default loopback binding is not LAN exposure; explicitly binding to another interface makes that data accessible to clients that can reach it. Do not deploy it publicly or expose it to an untrusted network without an appropriate access-control boundary. No authentication or CORS behavior was changed in this documentation/privacy pass.

The sync Worker requires `Bearer SYNC_TOKEN` for usage routes. Its URL and D1 ID do not themselves grant access. Sync transfers daily usage aggregates and machine identifiers/labels, which should still be treated as private. The plugin bridge keeps upstream credentials out of the browser; source labels and paths remain potentially sensitive telemetry metadata.

# Changes made

- Replaced personal fixture paths with generic examples; recalculated the tokenizer golden count against the pinned upstream tokenizer without weakening its assertions.
- Replaced the concrete D1 ID with an explicit setup placeholder and generalized the machine-sync guide.
- Removed a machine-specific temporary experiment path.
- Ignored `.env` and `.env.*`, preserving `.env.example` for setup.
- Replaced the README with a short feature overview, two screenshots, and dashboard/plugin usage. Retained accurate Node/pnpm badges, removed stale native-binding requirements and the unsupported MIT badge.
- Added the vendored-code license notice without assigning a project license.

# Screenshot provenance

`docs/images/dashboard.webp` shows the built production dashboard reading a newly generated SQLite database with 3,159 synthetic messages. OpenCode data, Codex data, HOME, and sync configuration were isolated from real user data. No real transcript or usage database was copied or modified.

`docs/images/insight.webp` shows the actual panel view and telemetry query builders in a standalone local preview with synthetic requests/tools, not the OpenChamber application shell. It is not proof of a live OpenCode/OpenChamber integration run. Both images were visually inspected and compressed to WebP. Dashboard capture waits for button color transitions to finish so the range picker does not show an intermediate double highlight.

# Verification

- Common private-key, GitHub, OpenAI/Anthropic, AWS, and Slack credential patterns: no matches in current tracked files or 1,402 reachable historical blobs. This is a pattern-based review, not a guarantee that no custom-format secret exists.
- Identified personal-path/deployment-identifier patterns: no matches in current tracked files after redaction. Historical copies remain as described above.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test`: passed; 872 tests, zero lint errors, 12 pre-existing lint warnings. Existing pnpm/Vite configuration warnings remain.
- `pnpm daemon:start --host 127.0.0.1 --port 8788`: readiness and static page returned HTTP 200; the smoke-test daemon was stopped afterward.
- README's Node CLI start/query/stop paths were exercised using synthetic data; the demo service was then started separately on loopback port 8788 for preview.
