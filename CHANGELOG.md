# @changehow/oc-insight

## 1.2.1

### Patch Changes

- ede11af: Add GPL-3.0-only licensing, document npm-based dashboard startup and environment loading, and use absolute screenshot URLs for the public repository. Remove the pre-publication review document and align installation examples with this patch release.

## 1.2.0

### Minor Changes

- 70ccc53: Use OpenChamber's existing host-selected OpenCode access for Insight and bundle the capture plugin for host-managed loading. Do not discover or start a separate OpenCode instance.

## 1.1.0

### Minor Changes

- ce0bc19: Add an independent, initially collapsed Speed section to OpenChamber Resources while retaining speed charts in the full Insight panel. Load telemetry only when its view is expanded and visible, pause requests when hidden, and fetch only speed data for the Resources section.
- ce0bc19: Add OpenCode V2 telemetry and an OpenChamber Insight panel to the existing package. Export platform entrypoints, provide installable extension paths through the CLI, and add rolling output charts, context attribution, persisted session queries, and foreground timing without requiring the dashboard daemon.

  Expose the same context, speed, and timing insights in the web dashboard's session details, with a direct V2 session-ID lookup independent of the legacy usage ledger.

  Attribute native skill attachments by their durable source identity and capture reported Code Mode child-call counts without inventing per-child timing or storing tool arguments.

  Simplify both Insight surfaces with a following ten-minute speed chart and token composition donuts, with mutually exclusive timing phase bars on the web dashboard.

  Use OpenChamber SDK controls and host-derived chart colors, apply theme changes without remounting, and preserve panel focus, open pickers, and chart inspection across telemetry refreshes. Show Speed, Tokens, and Times together in one scrolling panel instead of separate tabs.

  Replace the OpenChamber phase chart with a bounded, collapsible request/tool waterfall in the Times section, with repeated-tool aggregation, paged calls, selected-span details, short-call zoom, and recorded Code Mode summaries without inferred inner timings.

  Keep hover inspection layout-stable: open span details only on explicit activation in a bounded popover rather than resizing an inline inspector.

- ce0bc19: Show one unified TPS curve with a compact readout below the plot. Join captured throughput across request boundaries and confirmed idle periods without fabricating missing samples.

  Group the OpenChamber timeline directly by tool across the session, with bounded invocation paging and stable span popovers. Display reported Code Mode calls without a second disclosure, and remove explanatory footnotes and input-source detail lists while retaining token composition charts.

### Patch Changes

- ce0bc19: Avoid oversized Insight responses by aggregating complete token and timing summaries inside the OpenCode plugin, returning bounded speed windows, and loading tool and context-source details through scoped cursor pages. Update the OpenChamber panel and dashboard to use these purpose-specific queries while preserving the existing session and series RPC structures and values, response-size protection, and recoverable idle-session eviction.
- ce0bc19: Simplify the independent OpenChamber Speed section to show only the rate and chart. Hide explanatory captions and show Retry only when telemetry fails, without changing the full Insight panel.
- ce0bc19: Freeze Speed charts while idle and resume the last fifteen-minute window on new activity. Preserve idle charts when reopening, align the independent empty state with the TPS readout, and shorten its waiting message.
- ce0bc19: Use reported output plus reasoning request averages on compressed cumulative request time in the OpenChamber speed chart. Align the generation mean with the chart's request selection, preserve gaps for unavailable rates, and keep the readout limited to timestamps and speed.
- ce0bc19: Reduce retained telemetry memory with compact tokenizer ranks, bounded stream prefixes, recoverable idle-session eviction, and idle tokenizer cleanup. Avoid retaining completed RPC responses and redundant transcript copies while preserving native skill attribution, persisted statistics, and the existing public response schemas and values.
- ce0bc19: Remove the OpenChamber session-sidebar page entry while preserving the per-session Insight panel and host-managed telemetry service.
- ce0bc19: Render generation speed with smooth curves through measured request averages while preserving unavailable-data gaps and the original values.
- ce0bc19: Restore cached Speed displays when reopening the Resources section, defer reads until expansion, and reduce main-panel polling. Keep speed trends on the last fifteen wall-clock minutes, include observed reasoning in approximate live rates, and calibrate to reported output plus reasoning when requests complete. Improve Insight panel spacing and align the independent TPS readout with the numeric axis labels.

## 1.0.2

### Patch Changes

- f42ea88: Report the published package version from the `opendash` CLI, support `-v`, and document
  `OPENDASH_ENV` in its help output.

## 1.0.1

### Patch Changes

- f727bd2: Allow `opendash` to load a specified environment file through `OPENDASH_ENV`.

## 1.0.0

### Major Changes

- e684f32: Publish the stable 1.0.0 release under the new package name.

## 0.0.1

### Patch Changes

- Establish the package for npm Trusted Publishing.
