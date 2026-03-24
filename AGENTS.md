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

- For shared type changes, rebuild `@opencode-dashboard/shared` before validating dependents.
- Prefer these checks when relevant:
  - `pnpm --filter @opencode-dashboard/shared build`
  - `pnpm --filter @opencode-dashboard/web typecheck`
  - `pnpm --filter @opencode-dashboard/bff typecheck`
  - `pnpm --filter @opencode-dashboard/web build`
