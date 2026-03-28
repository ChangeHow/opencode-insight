# plan_session-message-runtime-20260328-145000-000

## Workflow

- Phases: `Prepare -> Execute -> Validate & Iterate -> Confirm & Archive`
- Gate: complete (or explicitly block with reason) all todos in current phase before entering next.
- Archive gate: `Confirm & Archive` stays open until all previous phases have evidence.
- Keep this file updated after every completed operation.

## Context

- **Goal**: Fix the session detail bug where message analytics and message list render empty for an existing session.
- **Scope in**: BFF message analytics/list data path, related regression tests, and verification for the reported session URL.
- **Scope out**: Unrelated dashboard/detail refactors, route redesign, or message UI redesign.
- **Existing code**:
  - `apps/web/src/routes/dashboard/session-detail-page.tsx` loads session summary via `fetchSession(...)` and message panels via `MessageAnalyticsPanel`.
  - `apps/web/src/components/dashboard/message-analytics-panel.tsx` requests `/message/analytics` and `/message` endpoints and silently keeps empty UI on failed/empty payloads.
  - `apps/bff/src/controllers/messages.ts` serves message analytics/list routes through `buildMessagePayloads(getDbPath(), sessionId)`.
  - `apps/bff/src/services/messages.ts` and `apps/bff/src/services/usage/sqlite-reader.ts` both need runtime-native sqlite access.
  - `apps/bff/src/services/sqlite.ts` is the new shared helper for Bun and Node sqlite access.
- **Dependencies**: `controllers/messages.ts`, `services/messages.ts`, SQLite helpers under `services/`, BFF tests under `apps/bff/src/__tests__`, and `AGENTS.md` verification guidance.
- **Constraints**:
  - Repo uses `pnpm` commands.
  - BFF daemon runs on Bun in local production smoke tests.
  - File size guideline: keep source files under 400 LOC.
  - Keep the fix minimal and avoid unrelated refactors.
- **Decisions**:
  - Use runtime-native SQLite APIs only: `bun:sqlite` in Bun and `node:sqlite` in Node.
  - Remove `better-sqlite3` from BFF dependencies instead of keeping a Node-only branch.
  - Prefer small extracted helpers so service files stay under the file-size limit.
  - Validate both by tests and by hitting the real reported session endpoints.
- **Assumptions**:
  - The reported session data is still present in the local OpenCode SQLite DB.
  - Bun's `bun:sqlite` parameter binding behavior matches the needed queries.
- **Risks**:
  - Runtime-specific DB access can regress Node test behavior; mitigate with a direct service test.
  - If empty payloads are caused by multiple issues, endpoint verification after the code change will reveal the gap.

# Prepare

## Todo

- [x] Reproduce the bug against the reported session and compare session summary endpoint vs message endpoints.
- [x] Trace frontend route -> BFF controller -> service chain and identify the runtime-specific failure point.
- [x] Define the minimal fix: migrate the message analytics/list SQLite access to runtime-native APIs and remove `better-sqlite3` usage.

## Notes

- The reported session exists in the usage snapshot and `/api/day/:date/session/:sessionId` returns data.
- `/api/day/:date/session/:sessionId/message/analytics` and `/message` return empty payloads, not 404.
- BFF logs show `better-sqlite3` throws under Bun inside `apps/bff/src/services/messages.ts`, and the service currently catches the error then returns empty arrays.

## Gate: Prepare -> Execute

- [x] Investigation steps have output recorded in Context above.
- [x] No unresolved open questions (assumptions flagged if any).
- [x] Each Execute todo references specific files/functions.
- [x] Impact scope assessed.
- [x] Validation strategy defined.
- [x] User approved creating a plan file and continuing execution.

# Execute

## Todo

- [x] Replace BFF SQLite access with runtime-native helpers (`bun:sqlite` / `node:sqlite`) and remove `better-sqlite3` usage from services.
- [x] Remove `better-sqlite3` and its types from package manifests / lockfile.
- [x] Add or adjust regression tests in `apps/bff/src/__tests__` to cover this sqlite-backed message detail scenario.
- [x] Update `AGENTS.md` so lint warnings do not block completion; only lint errors must be fixed.

## Execution Log

- 2026-03-28 14:50 - Drafted plan after reproducing the bug and confirming the Bun runtime failure path; evidence: `logs/bff.2026-03-28.1.log`, direct `curl` checks against `/api/day/.../session/...` and `/message/analytics`.
- 2026-03-28 14:58 - Added runtime-aware SQLite helpers in `apps/bff/src/services/messages-sqlite.ts` and switched `apps/bff/src/services/messages.ts` + `apps/bff/src/controllers/messages.ts` to async query flow compatible with Bun and Node.
- 2026-03-28 15:00 - Added regression coverage in `apps/bff/src/__tests__/messages.test.ts` and updated controller mocks in `apps/bff/src/__tests__/app.test.ts` for async `buildMessagePayloads`.
- 2026-03-28 15:12 - User requested a stricter follow-up: remove `better-sqlite3` entirely in favor of runtime-native SQLite APIs and update `AGENTS.md` so lint warnings do not block completion.
- 2026-03-28 15:18 - Replaced BFF sqlite access with shared runtime-native helper in `apps/bff/src/services/sqlite.ts`, updated message and usage sqlite readers, and removed `better-sqlite3` references from manifests and tests.
- 2026-03-28 15:19 - Updated `AGENTS.md` verification wording so lint warnings are explicitly non-blocking.

# Validate & Iterate

## Todo

- [x] Run targeted BFF tests covering message payload queries.
- [x] Run `pnpm build`.
- [x] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [x] Run `pnpm format:check`.
- [x] Run `pnpm test`.
- [x] Run daemon smoke verification and confirm the reported session endpoints now return populated message data.

## Validation Log

- 2026-03-28 15:02 - `pnpm --filter @opencode-dashboard/bff test -- --runInBand`; result: pass; evidence: 6 files / 42 tests passed.
- 2026-03-28 15:02 - `pnpm --filter @opencode-dashboard/bff typecheck`; result: pass.
- 2026-03-28 15:03 - `pnpm build`; result: pass.
- 2026-03-28 15:03 - `pnpm typecheck`; result: pass.
- 2026-03-28 15:03 - `pnpm lint`; result: blocked by pre-existing repository warnings unrelated to this fix (root `oxlint .` reports existing `react-in-jsx-scope`, import/no-unassigned-import, and unused import warnings outside the changed area).
- 2026-03-28 15:05 - `pnpm format:check`; result: pass after formatting `apps/bff/src/services/messages-sqlite.ts` and this plan file.
- 2026-03-28 15:04 - `pnpm test`; result: pass; evidence: BFF 42 tests passed, Web 59 tests passed.
- 2026-03-28 15:06 - `pnpm daemon:restart` plus direct endpoint checks; result: pass; evidence: reported session analytics returned `timeline=137`, `distribution points=137`, and message list returned 2 records for `pageSize=2`.
- 2026-03-28 15:23 - `pnpm install --lockfile-only`; result: pass; evidence: lockfile updated after removing `better-sqlite3` from manifests.
- 2026-03-28 15:24 - `pnpm --filter @opencode-dashboard/bff test`; result: pass after sqlite helper rewrite; evidence: 6 files / 42 tests passed.
- 2026-03-28 15:24 - `pnpm --filter @opencode-dashboard/bff typecheck`; result: pass after sqlite helper rewrite.
- 2026-03-28 15:26 - `pnpm build`; result: pass after dependency and sqlite helper cleanup.
- 2026-03-28 15:26 - `pnpm typecheck`; result: pass after dependency and sqlite helper cleanup.
- 2026-03-28 15:26 - `pnpm lint`; result: pass for errors, warnings remain non-blocking per updated `AGENTS.md`; evidence: root `oxlint .` reported warnings only, no errors.
- 2026-03-28 15:27 - `pnpm format:check`; result: pass after formatting shared sqlite helper and updated docs.
- 2026-03-28 15:26 - `pnpm test`; result: pass; evidence: BFF 42 tests passed, Web 59 tests passed.
- 2026-03-28 15:28 - `pnpm daemon:restart` plus direct endpoint checks; result: pass; evidence: reported session analytics returned `timeline=137`, `distribution points=137`, and message list returned 2 records for `pageSize=2` after removing `better-sqlite3`.

# Confirm & Archive

## Todo

- [x] All previous phase todos done with evidence.
- [x] Completion status set.
- [ ] Plan moved to `docs/plans/finished/`.

## Completion

- Status: done
