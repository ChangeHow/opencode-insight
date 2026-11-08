# Packages and runtime

The existing public package `@changehow/oc-insight` ships an OpenCode V2 plugin and an OpenChamber extension. It does not require the existing Insight BFF or a change to OpenChamber. The workspace packages below are private implementation modules, not separate npm releases.

- `packages/telemetry` owns the shared telemetry contract and metric calculations.
- `packages/insight-client` owns validated session queries. The dashboard uses discovery/configuration and native RPC; the OpenChamber bridge binds local capture reads to the host's approved OpenCode event stream.
- `packages/opencode-plugin` runs inside OpenCode. It collects numeric telemetry, persists snapshots, and exposes session queries through native plugin RPC.
- `packages/openchamber-extension` contains the sandboxed panel, a small local bridge process, and a dependency-free capture bundle for host-managed loading. OpenChamber starts the bridge on demand and manages its lifetime. Building stages the installable directory at `openchamber/`, with the root npm package's version.

The root package exports `@changehow/oc-insight/opencode`, `@changehow/oc-insight/opencode/rpc`, and `@changehow/oc-insight/openchamber`. OpenCode's native package loader also receives its `server` and `rpc` entrypoints. The OpenChamber module exports `directory` and `manifest`; its installer consumes the actual directory, not a JavaScript import specifier.

The dashboard also shows plugin telemetry in OpenCode session details. Its existing V1 and Codex usage readers remain independent: plugin estimates are not silently added to legacy billing totals. Historical V1/Codex records are not automatically imported into the live panel. For existing V2 sessions, the panel can recover persisted assistant usage and tool timing from the active context after the most recent compaction. These snapshots are partial and contain no reconstructed per-second speed or missing input-source attribution.

# Build and install

Use Node.js 24 and pnpm, then build both extensions:

```bash
pnpm install
pnpm build:extensions
```

For a standalone dashboard or an externally managed OpenCode, print the OpenCode plugin directory:

```bash
node scripts/opendash.mjs extension-path opencode
```

Add that directory to the OpenCode V2 configuration used by the target server. Preserve existing plugin entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-insight"],
}
```

The plugin targets OpenCode 2.0.26 or a compatible V2 plugin contract. Configuration changes must be picked up by the target OpenCode server before telemetry can be collected. Do not restart a server while other sessions are running just to activate the plugin.

Print the OpenChamber installable directory:

```bash
node scripts/opendash.mjs extension-path openchamber
```

Insight 1.2.0 includes host-shared support and requires OpenChamber 2.7.0+, without any host modifications. Insight 1.1.0 uses independently configured connections and does not contain host-shared support. OpenChamber 2.7.0 itself requires OpenCode 2.2.4+; the integration is tested with 2.2.5. Open **Settings → Extensions → Add** and install that `openchamber/` folder. Approve the local service, OpenCode reads, and bundled OpenCode plugin, then open **Insight** on the rail. Retain all built assets, including `opencode/`. OpenChamber does not compile TypeScript or install capture-bundle dependencies at runtime.

To install or upgrade to Insight 1.2.1 from npm instead of building from source:

```bash
npm install -g @changehow/oc-insight@1.2.1
opendash extension-path openchamber
```

OpenChamber can load the bundled capture plugin into its managed OpenCode. For an externally managed local OpenCode or a standalone dashboard, OpenCode can load the matching package directly:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@changehow/oc-insight@1.2.1"],
}
```

Use the package name in OpenCode configuration; the loader selects its `server` export and installs the package independently of the global npm installation. The `/opencode` subpath is a module export, not a separate npm package to install. In OpenChamber, install the folder printed by `opendash extension-path openchamber`. When upgrading, update both the panel and any separately configured capture plugin to the same version; avoid loading an older capture build alongside the host-managed bundle. Both platforms receive assets from the same release; these exports are not present in versions earlier than 1.1.0. For an npm-install quick start, see [OpenCode + OpenChamber plugins](../README.md#opencode--openchamber-plugins).

This implementation uses the existing SDK extension support for web and desktop. Other runtimes depend on their host's extension support.

# Beta releases

The existing Release workflow can publish a topic branch to npm's `beta` tag through Trusted Publishing. Select the `beta` channel and an unused explicit version such as `1.1.0-beta.0`. This does not merge the branch, create a stable release PR, or change `latest`. The workflow checks the package, builds both platform exports with the beta version, and completes when `npm publish` succeeds, without polling registry availability. npm may still be processing the package after accepting the upload.

On a test machine, install the published beta:

```bash
npm install -g @changehow/oc-insight@beta
opendash extension-path openchamber
```

Configure OpenCode with `"plugins": ["@changehow/oc-insight@beta"]`, or pin the exact prerelease version for a reproducible test. Install the printed OpenChamber directory and approve its local service. Node.js 24 and the platform requirements above still apply.

# OpenCode connection

## Host-shared panel

The OpenChamber backend and OpenCode must run on the same machine; the browser may connect remotely. An OpenChamber backend selecting OpenCode on another machine is not supported. Use the capture plugin and panel from the same Insight build.

The extension declares the existing `service.provides: ["opencode"]` role and `opencodePlugin: "opencode"`. It needs the existing `service`, `opencode`, and `opencodePlugin` approvals. It does not request a new capability or require native RPC forwarding.

OpenChamber supplies `OPENCHAMBER_OPENCODE_URL` and a service token. The bridge reads the selected session and the native event stream through that approved transport. The capture plugin publishes a small `rpc.opencode-insight.hostSource` announcement and serves numeric queries on an authenticated, ephemeral `127.0.0.1` listener inside the same OpenCode process. It exposes only the same 8 Insight queries, with their existing input/output schemas and size limits. Aggregation, pagination, storage, and history recovery stay in the capture plugin.

Each read verifies the source through fresh nonce events on the host stream before reading and after receiving the response. A stale local address cannot supply accepted data after a host switch or withdrawal. Stream failure clears discovered sources and pending confirmations; the next panel refresh reconnects. There is no discovery/configuration fallback. This does not provide an atomic snapshot across multiple queries or a same-address process replacement.

The local read token stays in the backend and never enters the iframe. No raw OpenCode credentials or server address are exported by the plugin. Browser-origin requests are refused. Unloading the capture plugin closes its listener and heartbeat; stopping the extension service closes its event subscription. The plugin does not write or replace session metadata, and announcements do not contain full telemetry snapshots.

OpenChamber loads the bundled plugin into managed OpenCode when it owns the watched config file. A user-owned `OPENCODE_CONFIG` can defer delivery until the next managed start; do not restart an active server just to activate it. For external local OpenCode, configure the matching capture build explicitly. Avoid loading an older capture build alongside the host-managed bundle. A cold location without the capture plugin running has no source to query; load the plugin and start a request there.

## Standalone dashboard and published 1.1.0 panel

The dashboard continues to use `Service.discover()` from `@opencode/client/service` to find an already-running managed OpenCode V2 service and obtain authentication headers. The published 1.1.0 panel uses the same independent connection strategy. Neither starts, stops, or restarts OpenCode. For an independently managed or remote instance, configure this optional file on the machine running that dashboard or legacy bridge:

```text
~/.config/opencode-insight/connection.json
```

For a different managed service registration:

```json
{
  "registrationFile": "/absolute/path/to/service.json"
}
```

For an explicit endpoint:

```json
{
  "url": "https://opencode.example.com",
  "auth": {
    "type": "basic",
    "username": "opencode",
    "password": "YOUR_SERVER_PASSWORD"
  }
}
```

Bearer authentication is also supported with `"auth": { "type": "bearer", "token": "YOUR_TOKEN" }`. Omit `auth` for a server that does not require it. Remote endpoints require HTTPS; plaintext HTTP is accepted only for loopback. URLs must be origins without embedded credentials, paths, queries, or fragments. Redirects are refused.

Keep credential files out of the repository and restrict their permissions:

```bash
chmod 600 ~/.config/opencode-insight/connection.json
```

The client rejects credential files readable by other users on Unix. Credentials stay server-side and never reach the browser. Queries validate the session directory and sanitize upstream failures. A wrong connection produces an error rather than an empty chart. The legacy panel needs matching configuration when OpenChamber switches servers. This file has no effect on the new host-shared panel.

# Web dashboard

Start the existing dashboard with `opendash server` after building or upgrading. Open **Inspect an OpenCode V2 session** on the overview and enter a `ses_…` ID. The existing `/sessions/<sessionID>` detail page includes **Context & speed insight**, with speed, input composition, and elapsed activity views. The plugin panel can load even if the legacy usage endpoint has no record for that V2 session. Codex details remain unchanged.

The BFF uses discovery and optional `connection.json`, independently of the host-shared panel. OpenCode must already be running with the capture plugin loaded. Neither the dashboard nor the extension starts or restarts OpenCode. OpenChamber is not required for the web dashboard, and the dashboard is not required for the OpenChamber panel.

The browser requests `GET /api/session/<sessionID>/insight/overview?after=<revision>` and `/insight/series-window` from the BFF. Sources and reported tool details use `/insight/sources` and `/insight/tools` only when expanded. Aggregation and pagination run inside the OpenCode plugin, not after transferring a full snapshot to the BFF. The legacy `/insight?after=<revision>` endpoint still returns its original `{ session, series }` payload for existing clients. The browser cannot choose an upstream URL and never receives OpenCode credentials. Visible pages refresh every second without overlapping requests; hidden pages pause. Switching sessions discards stale responses, and transient errors retain the last captured data with a warning.

# Persistence

The collector writes numeric JSON snapshots through OpenCode's documented, plugin-scoped `ctx.storage` interface. It does not run SQL, modify OpenCode's session tables, or create a separate Insight database. The physical backend is owned by OpenCode; integrations should query plugin RPC instead of depending on that backend's schema or path.

Keys are namespaced by directory, workspace, and session ID. Dirty snapshots are batched approximately once per second and flushed on normal plugin cleanup. Restarting the panel or dashboard does not delete them. An abrupt process failure can lose the most recent unflushed observations; interrupted work is marked partial when a snapshot is recovered. Bounded retention below applies to persisted details as well as in-memory state; older evicted details are not currently retained as a lifetime summary.

# Charts and measurement

The dashboard speed chart uses one-second buckets and five-second rolling rates over the most recent ten minutes while a request is running, then freezes at the final activity window. The OpenChamber chart instead connects reported **output + reasoning request averages** for the latest 40 model requests. Its horizontal axis is cumulative request time: every request keeps its full dispatch-to-stream-end duration, including first-response latency and internal stalls, while gaps between requests (tools and idle time) are removed. Overlapping requests contribute their own durations separately; the axis is not wall-clock elapsed time. Vertical dividers mark request boundaries. The line compares request averages, not instantaneous or reconstructed hidden-reasoning speed. Pointer hover, touch, and keyboard navigation expose each request's original timestamps and mean speed. Token composition uses a donut and compact percentage legends; reported usage stays separate from source estimates.

The OpenChamber panel shows Speed, Tokens, and Times together in a single scrolling view. Token source composition and reported usage sit side by side when the panel is wide enough and stack in that order when it narrows; each donut and legend also wraps within its own section. It uses SDK controls and applies the host theme before mounting, including subsequent light/dark or custom-theme changes. Chart categories use host syntax colors with theme-derived fallbacks; status colors remain reserved for status. Polling updates retained chart and detail nodes instead of replacing the panel, preserving keyboard focus, an open scope picker, expanded source details, and the inspected speed sample. Selecting another session resets session-specific inspection and input scope.

The calculations distinguish:

- **Current captured context:** the most recent outgoing request's source estimates. This is not a live reconstruction of unobserved model state.
- **Cumulative context:** source estimates added across captured requests. Repeated skill or history inputs count again on every request.
- **Reported usage:** OpenCode's normalized input, output, reasoning, cache-read, and cache-write counts. Reasoning is not added twice to provider output totals.
- **Rolling TPS:** tokenizer estimates from observed streaming content. Summary text is not a measurement of all hidden reasoning.
- **Request TPS:** reported `output + reasoning` divided by the request's dispatch-to-stream-end duration. It includes first-response waiting and excludes subsequent tool settlement. It is not a reconstruction of hidden per-second output.
- **OpenChamber generation mean:** the sum of reported `output + reasoning` divided by the sum of measurable request durations in the same latest-40-request selection as the chart. This is duration-weighted, not an arithmetic average of point rates. Requests lacking final usage or sufficient timing remain unavailable and interrupt the line rather than becoming zero-speed samples. Historical requests with sufficient reported usage and timing can supply request averages even without streaming buckets.

GPT/OpenAI reasoning summaries and other observable reasoning text have different measurement limits. Hidden reasoning is included in final usage when the provider reports it; no hidden per-second distribution is fabricated. Interrupted or missed collection remains marked partial. Requests without sufficient timing or usage do not receive an invented final TPS.

Skill content is attributed by ID when the request preserves enough source information. Remaining recognized skill content is grouped under an unclassified skill label. Tool result context and tool execution activity remain separate, including Code Mode child calls when the host exposes them.

Native Code Mode `metadata.toolCalls` is captured as reported child-call names and statuses under its parent tool. For example, three MCP reads appear as `files.read_text_file ×3`. This metadata does not expose individual call IDs, durations, or result token boundaries; the panels explicitly mark per-call timing unavailable and do not add invented child intervals to elapsed totals. The outgoing `execute` result remains aggregated context rather than claiming an exact token split by child tool. At most 2,048 reported child records are retained per parent; truncation is marked.

The web dashboard's Time view partitions foreground interval unions into a stacked phase bar: waiting before the first observable delta, observed streaming, unsplit model activity, mixed parallel model phases, and tool execution outside model intervals. Hover or focus a phase for its duration, percentage, count, and definition. Missing first-delta observations stay unsplit rather than being labeled model thinking. Overlapping model/tool time belongs to the model phase, so the bar adds up to foreground duration without double-counting. Background tool invocation intervals are separate. Detached process lifetimes after a background tool returns are not tracked. A parent request's explicit wait still belongs to its foreground activity. Child sessions remain independently queryable instead of silently merging their usage into the parent's total.

The OpenChamber panel's Times section uses a collapsible session → tool-group → invocation waterfall instead of a separate phase chart. Repeated tool names form expandable groups showing their execution union (U), with wall span and summed invocation time (Σ) in the selected-span inspector. These overlapping measurements are not additive session phases. Hover and focus only highlight rows; clicking a span or pressing Enter opens a bounded, non-modal detail popover anchored next to its chart row, flipping or shifting to fit the panel viewport without entering document flow. Escape, the close button, an outside press, or scrolling/resizing the owner dismisses it. Detail changes and Code Mode summaries scroll inside the popover without shifting the chart. The inspector shows recorded status, explicit request and parent IDs, reported usage/cost, and estimated result tokens where available; missing endpoints remain unavailable. Short calls use markers and can be inspected with **Zoom selected**. Code Mode retains only parent timing and optional reported name/status summaries, never fabricated inner spans or stored scripts.

Tool groups, individual calls, and reported summaries are paged in batches of 20. Only one repeated-tool group is expanded at a time, keeping at most 41 time-axis rows mounted even for large captures. Opening a group fetches its latest call page; older pages use stable capture-order cursors, not mutable timestamps. Polling retains the current page even as new calls arrive; **Latest tools** explicitly returns to the newest page. Polling retains expanded rows, selection, zoom, keyboard focus, and scroll. Running spans refresh once per second while visible, reusing closed aggregates. This waterfall is currently specific to the OpenChamber panel; the web dashboard retains its full-session phase chart.

Live collection begins when the plugin loads. The panel cannot recover token-arrival history that OpenCode did not retain before installation. The collector persists statistics and source identifiers, not full prompts, reasoning text, or tool result bodies. Treat source labels and paths as potentially sensitive metadata.

Capture is bounded to the latest 512 requests and 2,048 tool calls per session, 7,200 token buckets per request, and 64 in-memory sessions per location. Streaming text retention is bounded to 65,536 characters per request; large text estimates use a 2,048-character BPE sample. Retention or opaque-media limits mark capture partial rather than claiming complete lifetime totals. The chart filters by a ten-minute time window rather than a fixed sample count, preserving concurrent request samples. Corrupt persisted snapshots are reported as errors and are not silently replaced with empty data.

# Query through OpenCode

The native plugin RPC ID is `opencode-insight`. The existing `session` and `series` methods retain their original structures and content. They run on the configured OpenCode instance, scoped to the requested location. The generic HTTP interface is:

```text
POST /api/rpc/opencode-insight/session?location[directory]=/project
POST /api/rpc/opencode-insight/series?location[directory]=/project
```

Use the target OpenCode server's normal authentication. For example, a session query body is:

```json
{
  "input": {
    "sessionID": "ses_EXAMPLE"
  }
}
```

A series query accepts `bucketMs`, `windowMs`, and an optional `after` revision. An unchanged revision returns `unchanged: true`; a changed revision returns a replacement series so corrections to recent buckets cannot be lost. Persisted snapshots provide recovery after panel disconnection; live notifications are not a replay log.

## Purpose-specific queries

Official panels avoid the full `session` response and use these additive RPC methods:

- `overview`: complete retained-session usage, costs, current and cumulative input composition, foreground phases, and tool-group timing aggregates. An optional `after` revision returns a compact `unchanged: true` response when quiescent. Repeated context still counts on every captured request; no window is applied to Token totals.
- `speedWindow`: retains its at-most-ten-minute completed 15-second output buckets and adds a `generation` projection for the OpenChamber panel: up to 40 request averages, compressed request-time offsets, unavailable-rate counts, and their weighted mean. Optional `from`/`to` bounds select intersecting requests without truncating their duration or apportioning usage. No request context or tool bodies are returned.
- `seriesWindow`: the dashboard's existing five-second rolling estimator, limited to a ten-minute window, with request headers but no raw buckets or context sources.
- `toolPage`: bounded call details, optionally filtered by `group`, or one exact `toolID`. Pages default to 20 entries, allow at most 50, and also enforce a 256 KB encoded budget. Use `cursor` to refresh the same page and `nextCursor`/`previousCursor` to navigate. Cursors bind the session, directory, group, page size, and original capture prefix; newly appended calls cannot shift an existing page. Retention invalidation returns `reset: true`.
- `sourcePage`: current or cumulative context-source details, optionally filtered by `kind`, defaulting to 50 entries and capped at 100 plus an encoded byte budget. Cursors are scoped to the captured input identity; a replacement input returns `reset: true` rather than mixing snapshots.

All accept `sessionID`; optional speed bounds require both `from` and `to`, with a positive span of at most ten minutes. Every method verifies the native session location before reading telemetry, including unchanged responses. The bridge's existing 7,000,000-byte response guard is unchanged. A single oversized detail entry fails explicitly rather than being silently truncated. No persistent full-snapshot query cache is added: idle collector eviction and unchanged polling remain independent of panel visibility.

# Verification

Run the focused extension checks:

```bash
pnpm build:extensions
pnpm test:extensions
```

With a compatible `opencode` executable on PATH, run `pnpm smoke:extensions` after `pnpm build`. It copies the bundled capture plugin to an isolated directory without `node_modules`, starts a temporary V2 server, and checks native RPC, all 8 built-panel queries through a read-only host fixture, withdrawal, and the independent dashboard path. The fixture refuses native RPC forwarding. No model requests are sent and the managed OpenCode service is untouched.

To run the same check against an unmodified OpenChamber provider, build the SDK in an OpenChamber 2.7.0 checkout and run:

```bash
OPENCHAMBER_SOURCE_DIR=/absolute/path/to/openchamber pnpm smoke:extensions
```

The host's own parser validates the manifest and its provider enforces the existing grants. The test confirms that native RPC remains forbidden and the host-shared snapshot matches the native capture result.

Before handing off source changes, run the repository's full build, typecheck, lint, format, test, and daemon smoke checks described in [AGENTS.md](../AGENTS.md).
