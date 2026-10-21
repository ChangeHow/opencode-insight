# Packages and runtime

The existing public package `@changehow/oc-insight` ships an OpenCode V2 plugin and an OpenChamber extension. It does not require the existing Insight BFF or a change to OpenChamber. The workspace packages below are private implementation modules, not separate npm releases.

- `packages/telemetry` owns the shared telemetry contract and metric calculations.
- `packages/opencode-plugin` runs inside OpenCode. It collects numeric telemetry, persists snapshots, and exposes session queries through native plugin RPC.
- `packages/openchamber-extension` contains the sandboxed panel and a small local bridge process. OpenChamber starts the bridge on demand and manages its lifetime. Building stages the installable directory at `openchamber/`, with the root npm package's version.

The root package exports `@changehow/oc-insight/opencode`, `@changehow/oc-insight/opencode/rpc`, and `@changehow/oc-insight/openchamber`. OpenCode's native package loader also receives its `server` and `rpc` entrypoints. The OpenChamber module exports `directory` and `manifest`; its installer consumes the actual directory, not a JavaScript import specifier.

The existing dashboard, V1 reader, and Codex reader continue to work independently. Historical V1/Codex records are not automatically imported into the live panel. For existing V2 sessions, the panel can recover persisted assistant usage and tool timing from the active context after the most recent compaction. These snapshots are partial and contain no reconstructed per-second speed or missing input-source attribution.

# Build and install

Use Node.js 24 and pnpm, then build both extensions:

```bash
pnpm install
pnpm build:extensions
```

For a local checkout, print the OpenCode plugin directory:

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

In OpenChamber 2.5.0 or later, open **Settings → Extensions → Add** and install that `openchamber/` folder. Approve its local-process capability, then open **Insight** on the rail. Its full-page view is also available from Extension pages. Retain the built panel and service assets. OpenChamber does not compile TypeScript at runtime.

After this change is released through the existing npm release workflow, install or upgrade the same package:

```bash
npm install -g @changehow/oc-insight@latest
opendash extension-path openchamber
```

OpenCode can load the published package directly:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@changehow/oc-insight"],
}
```

Use the package name in OpenCode configuration; the loader selects its `server` export. The `/opencode` subpath is a module export, not a separate npm package to install. In OpenChamber, install the folder printed by `opendash extension-path openchamber`. Both platforms receive assets from the same release. These new exports are not present in earlier published versions.

This implementation uses the existing SDK extension support for web and desktop. Other runtimes depend on their host's extension support.

# Beta releases

The existing Release workflow can publish a topic branch to npm's `beta` tag through Trusted Publishing. Select the `beta` channel and an unused explicit version such as `1.1.0-beta.0`. This does not merge the branch, create a stable release PR, or change `latest`. The workflow checks the package, builds both platform exports with the beta version, and verifies both dist-tags after publishing.

On a test machine, install the published beta:

```bash
npm install -g @changehow/oc-insight@beta
opendash extension-path openchamber
```

Configure OpenCode with `"plugins": ["@changehow/oc-insight@beta"]`, or pin the exact prerelease version for a reproducible test. Install the printed OpenChamber directory and approve its local service. Node.js 24 and the platform requirements above still apply.

# OpenCode connection

By default the bridge uses `Service.discover()` from `@opencode/client/service` to find an already-running managed OpenCode V2 service and obtain its authentication headers. It never starts, stops, or restarts OpenCode. The bridge does not start the Insight BFF.

OpenChamber can use an independently managed or remote OpenCode instance. In that case, configure the connection on the machine running OpenChamber's backend. The bridge reads this optional file:

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

The bridge rejects credential files readable by other users on Unix. Credentials stay in the bridge and never reach the iframe. It forwards only the Insight session and series queries, validates the session directory against OpenCode, and sanitizes upstream failures. A wrong connection produces an error rather than an empty chart. A configured endpoint is instance-wide for this extension; switching OpenChamber to another server requires a matching bridge configuration on that server.

# Charts and measurement

The speed chart uses one-second buckets and a five-second rolling window. Pointer hover, touch, and keyboard navigation expose point details. There is no separate request-speed table. Input composition and timing are separate views.

The calculations distinguish:

- **Current captured context:** the most recent outgoing request's source estimates. This is not a live reconstruction of unobserved model state.
- **Cumulative context:** source estimates added across captured requests. Repeated skill or history inputs count again on every request.
- **Reported usage:** OpenCode's normalized input, output, reasoning, cache-read, and cache-write counts. Reasoning is not added twice to provider output totals.
- **Rolling TPS:** tokenizer estimates from observed streaming content. Summary text is not a measurement of all hidden reasoning.
- **Request TPS:** reported `output + reasoning` divided by the request's dispatch-to-stream-end duration. It includes first-response waiting and excludes subsequent tool settlement. It is not a reconstruction of hidden per-second output.

GPT/OpenAI reasoning summaries and other observable reasoning text have different measurement limits. Hidden reasoning is included in final usage when the provider reports it; no hidden per-second distribution is fabricated. Interrupted or missed collection remains marked partial. Requests without sufficient timing or usage do not receive an invented final TPS.

Skill content is attributed by ID when the request preserves enough source information. Remaining recognized skill content is grouped under an unclassified skill label. Tool result context and tool execution activity remain separate, including Code Mode child calls when the host exposes them.

Foreground duration uses interval unions so parallel work is not double-counted. Background tool invocation intervals are separate. Detached process lifetimes after a background tool returns are not tracked. A parent request's explicit wait still belongs to its foreground activity. Child sessions remain independently queryable instead of silently merging their usage into the parent's total.

Live collection begins when the plugin loads. The panel cannot recover token-arrival history that OpenCode did not retain before installation. The collector persists statistics and source identifiers, not full prompts, reasoning text, or tool result bodies. Treat source labels and paths as potentially sensitive metadata.

Capture is bounded to the latest 512 requests and 2,048 tool calls per session, 7,200 token buckets per request, and 64 in-memory sessions per location. Streaming text retention is bounded to 65,536 characters per request; large text estimates use a 2,048-character BPE sample. Retention or opaque-media limits mark capture partial rather than claiming complete lifetime totals. The chart renders at most 600 recent points. Corrupt persisted snapshots are reported as errors and are not silently replaced with empty data.

# Query through OpenCode

The native plugin RPC ID is `opencode-insight`. Its methods are `session` and `series`. They run on the configured OpenCode instance, scoped to the requested location. The generic HTTP interface is:

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

# Verification

Run the focused extension checks:

```bash
pnpm build:extensions
pnpm test:extensions
```

With a compatible `opencode` executable on PATH, run `pnpm smoke:extensions` after building. It starts an isolated temporary V2 server, verifies plugin RPC and the built authenticated bridge, then removes its own temporary state. It sends no model requests and does not touch the managed OpenCode service.

Before handing off source changes, run the repository's full build, typecheck, lint, format, test, and daemon smoke checks described in [AGENTS.md](../AGENTS.md).
