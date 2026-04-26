# Context

- Status: planning only, no implementation started.
- Goal: improve mobile browsing quality across `overview`, `providers`, `detail/$date`, and `detail/$date/$session` while preserving the current desktop visual language.
- Evidence sources:
  - Code review of `apps/web/src`
  - Live screenshots captured with Playwright CLI to `/tmp/`
  - Screenshot set:
    - `/tmp/opendash-overview-desktop.png`
    - `/tmp/opendash-overview-mobile.png`
    - `/tmp/opendash-providers-desktop.png`
    - `/tmp/opendash-providers-mobile.png`
    - `/tmp/opendash-detail-day-mobile.png`
    - `/tmp/opendash-detail-session-mobile.png`

# Key Findings

- Mobile overview has page-level horizontal overflow, not just dense cards.
  - The full-page mobile capture shows a large empty gutter on the right, which means some sections are forcing the layout wider than the viewport.
- The sticky header is too dense for mobile.
  - `Overview / Providers`, latest scan, theme, refresh, range preset, and custom date range all compete for the first screen.
- The calendar section is still desktop-first.
  - It consumes too much vertical space and the day cells still carry more information than mobile needs.
- Detail and session pages are the worst mobile experience.
  - The mobile captures show clipped panels and horizontal overflow from the fixed-width horizontal rail.
- Provider and ledger data are still biased toward desktop table scanning.
  - On mobile, users can only partially see the table and must infer missing columns.

# Scope

- In scope:
  - Mobile layout and interaction improvements for the web app under `apps/web`
  - Responsive behavior for shared dashboard shells and major content panels
  - Reducing or removing horizontal scrolling on phones
- Out of scope:
  - Visual redesign for desktop
  - Data model or API changes
  - New dashboard features unrelated to mobile usability

# Proposed Changes

## Mobile Layout Foundation

- Add an explicit mobile-first spacing pass across dashboard shells.
  - Reduce default horizontal padding from `px-6` to `px-4` on small screens.
  - Reduce card inner padding from `p-6` to `p-4` on small screens where density is too high.
- Eliminate page-level horizontal overflow.
  - Audit sections that can exceed viewport width and force them back to `w-full min-w-0` on mobile.
  - Keep horizontal scrolling only for tightly scoped, intentional containers.

## Header And Time Controls

- Rebuild the mobile control bar into three layers instead of one dense block.
  - Row 1: full-width `Overview / Providers` switch.
  - Row 2: `Latest scan` plus `Refresh` and a compact theme control.
  - Row 3: time controls.
- Change range controls for mobile.
  - Keep preset chips visible.
  - Turn custom date range into a full-width trigger.
  - Use a mobile sheet for date selection instead of a compact popover.
- Mobile date picker behavior:
  - One month at a time.
  - Preset reset action remains available inside the sheet.

## Overview Page

- Keep the current desktop composition.
- On mobile, restack summary metrics into a clearer reading order.
  - One primary hero metric first.
  - Remaining metrics as compact stacked cards.
- Mobile heatmap changes:
  - Remove spend text from the day cell on small screens.
  - Keep intensity and date in the cell.
  - Show selected-day summary below the calendar with spend, tokens, messages, and entry CTA.
- Trend chart changes:
  - Slightly lower chart height on mobile.
  - Keep series selector full-width and easy to tap.
- Provider ledger on overview:
  - Replace the wide table with mobile cards under `md`.
  - Each card shows model, provider, spend, tokens, and messages.
  - Keep the current table for desktop.

## Providers Page

- Keep the current summary cards, but tighten spacing on mobile.
- Replace the desktop ledger table with provider cards on mobile.
  - Each card should show provider, spend, tokens, messages, coverage, active days, and top model.
  - Tapping the card still opens the provider detail sheet.
- Keep desktop table behavior unchanged.

## Provider Detail Sheet

- Make the sheet more phone-native.
  - Single-column metrics on mobile.
  - Lower chart height.
  - Replace inner model table with stacked model cards on mobile.
- Preserve the existing richer table layout on larger screens.

## Day Detail And Session Detail

- Remove the mobile dependency on horizontal panel rails.
  - Under `md`, detail panels should stack vertically.
  - At `md+`, preserve the current rail behavior.
- Stop centering horizontal scroll on mobile.
  - The current rail auto-centering makes first paint worse when the layout already overflows.
- Update summary cards for mobile.
  - Title, description, and stats should flow vertically instead of desktop-style side-by-side packing.
- Session list already works better than the rail, but should still get tighter mobile spacing.

## Message Analytics

- Keep the current tab model.
- Make tabs full-width and easier to tap on mobile.
- Reduce chart height slightly so the first chart appears sooner.

# File Targets

- Shared layout and controls:
  - `apps/web/src/routes/layout.tsx`
  - `apps/web/src/routes/shared.tsx`
  - `apps/web/src/components/dashboard/list-layout-shell.tsx`
  - `apps/web/src/components/dashboard/date-range-picker.tsx`
  - `apps/web/src/components/dashboard/range-picker.tsx`
- Overview:
  - `apps/web/src/routes/overview.tsx`
  - `apps/web/src/components/dashboard/heatmap.tsx`
  - `apps/web/src/components/dashboard/trend-chart.tsx`
- Providers:
  - `apps/web/src/components/dashboard/provider-insights-page.tsx`
  - `apps/web/src/components/dashboard/provider-detail-sheet.tsx`
- Detail pages:
  - `apps/web/src/components/dashboard/horizontal-panel-rail.tsx`
  - `apps/web/src/components/dashboard/detail-summary-card.tsx`
  - `apps/web/src/components/dashboard/token-breakdown-panel.tsx`
  - `apps/web/src/components/dashboard/model-breakdown-panels.tsx`
  - `apps/web/src/components/dashboard/day-breakdown.tsx`
  - `apps/web/src/components/dashboard/session-breakdown.tsx`
  - `apps/web/src/components/dashboard/message-analytics-panel.tsx`
- Shared styling:
  - `apps/web/src/styles.css`

# Execution Order

- Phase 1: remove mobile overflow at the layout shell and control-bar level
- Phase 2: fix detail/session mobile layout by replacing rail behavior with stacked flow under `md`
- Phase 3: simplify overview mobile heatmap and overview ledger
- Phase 4: cardify providers page and provider detail sheet on mobile
- Phase 5: polish message analytics tabs and remaining mobile spacing inconsistencies

# Acceptance Criteria

- No page-level horizontal scrolling at `390px` width on:
  - `/overview`
  - `/providers`
  - `/detail/$date`
  - `/detail/$date/$session`
- The first mobile viewport shows navigation and time controls without feeling compressed.
- Detail and session pages do not rely on horizontal swiping to reveal primary content.
- Mobile users can read ledger content without horizontal table dragging.
- Desktop layout remains visually close to the current design.

# Verification Plan

- Run Playwright screenshots again for the same routes after implementation.
- Verify the full project pipeline required by this repo:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm daemon:restart
curl -sf http://127.0.0.1:8787 -o /dev/null
pnpm daemon:stop
```

# Notes

- The mobile screenshots revealed a stronger problem than the initial code-only review suggested: this is not only a density issue, but also a real viewport overflow issue.
- Because of that, the first implementation pass should prioritize overflow containment before visual polish.
