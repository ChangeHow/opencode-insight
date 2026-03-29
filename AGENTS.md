# Project Agents

## Language

- Use Simplified Chinese for conversation with the user.
- Keep code, identifiers, comments, and engineering artifacts in English unless the user explicitly requests otherwise.

## Working Style

- Prefer minimal diffs and avoid unrelated refactors.
- Verify changes with concrete commands before claiming completion.
- Use `pnpm` commands in this repo.

## Subagent Delegation

- Prefer `gpt-5.3-codex` for independent, bounded subtasks.
- Keep architecture decisions, cross-page integration, final review, and ambiguous high-coupling work in the main thread.
- Delegate local code reading, targeted bug fixes, isolated UI components, and clear single-scope implementations to subagents.
- Delegate only when the write scope is clear and does not conflict with ongoing main-thread edits.
- When using a subagent, assign explicit file ownership and avoid overlapping edits.
- Main thread is responsible for final integration, validation, and user-facing explanation.

## Routing For Agent Choice

- Use subagents for:
  - isolated frontend component implementation
  - single-module backend aggregation changes
  - narrow codebase exploration
  - table/chart/UI refinements with clear boundaries
- Do not use subagents for:
  - final cross-file wiring on the critical path
  - unclear product decisions
  - conflicting edits in the same file
  - final acceptance and verification

## Verification

After any non-trivial change (refactor, feature, dependency update), run the full verification pipeline in order. Do not claim completion until all steps pass.

### 1. Build all packages

Ensure every package compiles without errors:

```bash
pnpm build
```

For shared type changes, rebuild `@opencode-dashboard/shared` first:

```bash
pnpm --filter @opencode-dashboard/shared build
```

### 2. Typecheck

```bash
pnpm typecheck
```

Or individually:

```bash
pnpm --filter @opencode-dashboard/web typecheck
pnpm --filter @opencode-dashboard/bff typecheck
```

### 3. Lint & Format

```bash
pnpm lint
pnpm format:check
```

Only lint errors block completion. Lint warnings may be reported separately and do not need to be fixed unless the current task touches them or the user asks for warning cleanup.

### 4. Tests

```bash
pnpm test
```

### 5. Daemon smoke test

The daemon runs the production build (BFF serves the static web dist). After `pnpm build` succeeds, verify the daemon starts and responds correctly:

```bash
pnpm daemon:restart
curl -sf http://127.0.0.1:8787 -o /dev/null
```

If the daemon fails to start, check `logs/bff-error.log` for the root cause. Clean up after verification:

```bash
pnpm daemon:stop
```

### Quick checklist

For every non-trivial change, confirm all of the following before reporting done:

- [ ] `pnpm build` — all packages compile
- [ ] `pnpm typecheck` — no type errors
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm format:check` — formatting is consistent
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm daemon:start` + health check — daemon runs and serves the app

---

## Code Style & Architecture Requirements

### Linting & Formatting

- **Lint tool**: `oxlint` — sole linting tool, no ESLint.
- **Format tool**: `oxc-format` (oxfmt) — sole formatter, no Prettier.
- **Pre-commit**: `husky` + `lint-staged` runs `oxlint --fix` and `oxc-format --write` on staged files. No vitest or Playwright in lint-staged hooks.
- **No `eslint-disable` comments**: Remove all existing eslint-disable directives. If a rule must be suppressed, use oxlint's equivalent inline comment.
- Typecheck (`tsc --noEmit`) remains a separate step, not part of lint-staged.

### File Size Limit

- **Max 400 lines per file** (source files, excluding tests and generated code).
- When a file approaches this limit, extract cohesive units into separate modules.
- Prefer extracting by domain responsibility, not by arbitrary line count splits.

### BFF Architecture (apps/bff)

- **Controller/Service separation**:
  - `controllers/` — thin route handlers, responsible for HTTP concerns (params, query, response shaping). No business logic.
  - `services/` — pure business logic, data aggregation, DB queries. Framework-agnostic (no Hono `Context` dependency).
- **Type aggregation**: Internal types (e.g. `RawMessage`, `UsageSnapshot`) live in `services/*/types.ts`. Shared API types come from `@opencode-dashboard/shared`.
- `app.ts` only wires middleware and mounts controllers; no inline route handlers.

### Frontend State Management (apps/web)

- **Domain-aggregated atoms**: Organize Jotai atoms by domain, not as a flat file.
  - `lib/atoms/dashboard.ts` — summary, heatmap, trend, series
  - `lib/atoms/providers.ts` — provider insights
  - `lib/atoms/detail.ts` — day, session, detail loading
  - `lib/atoms/messages.ts` — message overview, distribution, list, cache
  - `lib/atoms/ui.ts` — theme, range, customDateRange, loading, error
  - `lib/atoms/index.ts` — re-exports all
- **No duplicated data hooks**: Common patterns (auto-refresh, loading/error management, request deduplication) must be shared via a reusable hook or utility. Do not copy-paste fetch + refresh logic across hooks.
- **State co-location**: If state is only used by one component, keep it local (useState). Jotai atoms are for cross-component or cross-page shared state.

### Router & Layouts (apps/web)

- **Use `@tanstack/react-router` Outlet pattern** for nested layouts. Do not manually wrap pages in layout components.
- **Layout route hierarchy**:
  - `rootRoute` — global concerns (theme)
  - `dashboardLayoutRoute` — shared dashboard shell
  - Page routes are children of layout routes
- **Reusable layout shells**: Similar pages (e.g. detail and session-detail) must share a layout component rather than duplicating wrapper markup.
  - `ListLayoutShell` — for overview/providers (shared ControlBar, range picker)
  - `DetailLayoutShell` — for detail/session-detail (shared DetailStickyHeader, centered card container, error panel)
- **Pages are pure content**: Page components render only domain-specific content. Layout, header, error panels, and padding are owned by layout shells.

### Component Organization

- **`components/ui/`** — generic UI primitives (Button, Card, Tooltip, etc.). No business logic.
- **`components/dashboard/`** — dashboard-specific composed components (Heatmap, TrendChart, etc.).
- **`routes/dashboard/`** — page components and route-specific code only.
- **Extract reusable patterns**: If a UI pattern appears in 2+ pages (e.g. `Stat` component, `SessionCard`), extract it to `components/dashboard/`.
- **No God components**: A component should have a single clear responsibility. If a component does layout + data fetching + rendering, split it.

### Testing

- **Unit tests**: Vitest, one `describe` per file, prefer `test` over `it`.
- **E2E tests**: Playwright, test files in `e2e/`, mock API fixtures in `e2e/fixtures.ts`.
- **Test scripts**: `pnpm test` for vitest, `pnpm test:e2e` for Playwright. Both at root level.
- **No tests in lint-staged**: Tests run via CI or explicit `pnpm test` / `pnpm test:e2e` commands.

### General Principles

- Imports from `@opencode-dashboard/shared` are the single source of truth for API types.
- Prefer named exports over default exports (except for route components used by `createRoute`).
- Use path aliases (`@/` for web, relative imports for bff).
- Keep `packages/shared` API surface stable; breaking changes require coordinated updates across web and bff.
