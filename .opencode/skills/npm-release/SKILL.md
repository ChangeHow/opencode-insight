---
name: npm-release
description: Use when preparing a release, adding a Changeset, changing package versions, or diagnosing npm/GitHub Actions publishing for this project.
---

# Npm Release

The public package is `@changehow/oc-insight`. Do not publish an unscoped package.

## Release Flow

1. Add a Changeset for every user-facing package change:

   ```md
   ---
   "@changehow/oc-insight": patch
   ---

   Describe the release.
   ```

2. Use `patch`, `minor`, or `major` according to the intended SemVer change.
3. Run `pnpm changeset status` and confirm the planned version before committing.
4. Merge the change to `main`.
5. The `Release` workflow runs build and tests, creates a Release PR with the generated version and changelog, auto-merges it, then publishes through npm Trusted Publishing.

## Publishing Requirements

- npm Trusted Publisher must target `ChangeHow/opencode-token-dashboard` and `.github/workflows/release.yml` with the `npm publish` permission.
- The release workflow requires `contents: write` and `id-token: write` GitHub permissions.
- Do not use npm tokens or manually run `npm publish` for routine releases.
- Use `npm publish --dry-run` only to inspect the package tarball before the initial publication or a packaging change.

## Verification

Before merging a release-bearing change, run:

```bash
pnpm changeset status
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

After the Release workflow finishes, confirm the published version with:

```bash
npm view @changehow/oc-insight version --cache-min=0
```
