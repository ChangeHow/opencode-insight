# OpenCode Token Dashboard

[![Node](https://img.shields.io/badge/node-%E2%89%A524-026E00?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A510-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![glibc](https://img.shields.io/badge/glibc-%E2%89%A52.31-4A90D9?logo=linux&logoColor=white)](https://www.gnu.org/software/libc/)
[![better-sqlite3](https://img.shields.io/badge/better--sqlite3-12.8-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Local-first token usage dashboard for OpenCode sessions.

The optional [V2 telemetry plugin and OpenChamber panel](docs/v2-insight.md) add live output curves, context-source estimates, and foreground timing without running the dashboard daemon or modifying OpenChamber.

The web dashboard also displays these metrics on OpenCode session detail pages. Use **Inspect an OpenCode V2 session** on the overview to open a session by ID, including sessions absent from the legacy usage ledger. This web view requires the dashboard server and an already-running OpenCode V2 instance with the plugin loaded.

## Install Insight plugins

The OpenCode capture plugin and OpenChamber panel ship together in `@changehow/oc-insight` starting with version 1.1.0. Using the panel does not require the dashboard daemon, a source checkout, or a separate BFF.

You need Node.js 24+, OpenCode 2.0.26 (or a compatible V2 plugin contract), and OpenChamber 2.5.0+ for the panel.

### OpenCode capture plugin

Add the package to `plugins` in the target OpenCode server's configuration. Use `~/.config/opencode/opencode.jsonc` for all projects, or a project-local `opencode.jsonc` for one project. Preserve any existing plugin entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@changehow/oc-insight"],
}
```

OpenCode installs the package and loads its server entrypoint; a global npm installation is not needed for this step. Do not use `@changehow/oc-insight/opencode` as the package name.

The target OpenCode server must pick up the configuration before capture begins. If a restart is needed, wait until its active sessions have finished. Insight itself never starts or restarts OpenCode.

### OpenChamber Insight panel

Install the package globally and print the extension directory:

```bash
npm install -g @changehow/oc-insight@latest
opendash extension-path openchamber
```

In OpenChamber, open **Settings → Extensions → Add** and select the printed `openchamber/` folder. Approve its local-process capability, then open **Insight** on the rail and select an OpenCode session. Install the directory, not the JavaScript import specifier `@changehow/oc-insight/openchamber`.

The panel's bridge discovers an already-running managed OpenCode V2 service by default. The service must have the capture plugin loaded. If OpenChamber uses another local or remote instance, configure the bridge's [OpenCode connection](docs/v2-insight.md#opencode-connection) on the machine running OpenChamber's backend.

To upgrade the OpenChamber assets, rerun the npm installation and path commands and update the installed extension from that folder. OpenCode manages its configured package separately; a global npm upgrade does not update an already-loaded capture plugin.

For source builds, beta releases, and measurement limits, see the [detailed Insight guide](docs/v2-insight.md).

## Dashboard requirements

| Dependency  | Minimum | Notes                                                               |
| ----------- | ------- | ------------------------------------------------------------------- |
| **Node.js** | 24.x    |                                                                     |
| **pnpm**    | 10+     |                                                                     |
| **glibc**   | ≥ 2.31  | Debian 11+, Ubuntu 20.04+. Alpine (musl) not supported              |
| **GCC**     | ≥ 10    | Required by `better-sqlite3` (C++20). No prebuild for older distros |

The BFF reads OpenCode usage from the directory configured in `.env.local`.
It queries `opencode.db` via the `better-sqlite3` native binding, which compiles against the system toolchain at install time. Older distributions (e.g. Debian 10, Ubuntu 18.04) ship glibc and GCC versions that are too old for this dependency.

When `opendash` is installed globally, load a project-local environment file by setting `OPENDASH_ENV`. Relative paths are resolved from the directory where you run the command:

```bash
OPENDASH_ENV=.env.local opendash server
```

The daemon logs whether the configured file was loaded. Values in the file are not logged.

Expected files inside that directory:

- `opencode.db`
- `storage/message/`

## Install dashboard from source

```bash
nvm use
pnpm install
cp .env.example .env.local
```

Then set:

```bash
OPENCODE_DATA_DIR=/absolute/path/to/opencode
```

## Recommended: run as a background daemon

For daily use, the recommended way is to build once and let the dashboard run in the background.
This gives you a single command to start, a single command to stop, and a predictable upgrade flow.

### First start

```bash
pnpm build
opendash server
```

Open the dashboard at:

- Dashboard: `http://127.0.0.1:8787`

To listen on all interfaces (e.g. for LAN access):

```bash
opendash server --lan
```

The daemon command prints:

- the current PID
- the access URL
- the log path: `logs/bff.log`
- the error log path: `logs/bff-error.log`

### Common daemon operations

```bash
pnpm daemon:start
pnpm daemon:stop
pnpm daemon:restart
opendash server --port 9000
opendash server --lan --port 9000
```

Useful log command:

```bash
tail -f logs/bff.log
```

### Query usage from the CLI

The `opendash` CLI can query the running daemon directly, `tokscale`-style — table output by default, `--json` for scripting:

```bash
opendash summary                      # totals, streaks, top model (default 7d)
opendash models --range month         # per-model spend and volume
opendash daily --range 3mo --limit 14 # recent active days
opendash providers --range all        # per-provider totals
opendash models --json > report.json  # raw JSON for automation
opendash summary --start 2026-07-01 --end 2026-07-31   # custom window
```

Common flags: `--range 7d|month|3mo|year|all`, `--start/--end`, `--json`, `--url <base>` (defaults to the daemon on `127.0.0.1:8787`).

### Upgrade while running in the background

If the dashboard is already running as a daemon, use the built-in upgrade script:

```bash
pnpm upgrade:app
```

That flow will:

1. `git pull`
2. install updated dependencies
3. rebuild the app
4. stop the old daemon
5. start the new daemon

If any step fails, the script exits with an error so you can inspect the output before retrying.

## Development mode

If you are actively changing code, run the web app and BFF in separate terminals:

```bash
pnpm dev:bff
pnpm dev:web
```

Default local addresses:

- Web: `http://127.0.0.1:3000`
- BFF: `http://localhost:8787`

To listen on all interfaces, pass `--host`:

```bash
pnpm dev:bff -- --host 0.0.0.0
```

Both `--host` and `--port` are supported by the BFF server and daemon (CLI args take priority over env vars).

Process titles for local debugging:

- Client: `opencode-telescope-client`
- BFF: `opencode-telescope-bff`

If the ports are already occupied, the dev scripts will stop before Vite starts and print the current listener PID and process name.

## Scripts

```bash
pnpm dev
pnpm dev:bff
pnpm dev:web
pnpm stop:bff
pnpm stop:web
pnpm restart:bff
pnpm restart:web
pnpm daemon:start
pnpm daemon:stop
pnpm daemon:restart
pnpm upgrade:app
pnpm build
pnpm typecheck
pnpm lint
```

## API

- `GET /api` — machine-readable index of every endpoint
- `GET /api/summary?range=7d|month|3mo|year|all`
- `GET /api/heatmap?range=…`
- `GET /api/trend?range=…`
- `GET /api/series?range=…&series=<key>`
- `GET /api/dashboard?range=…` — consolidated payload
- `GET /api/providers?range=…` / `GET /api/provider/:providerId`
- `GET /api/day/:date` / `GET /api/session/:sessionId…`
- `GET /api/sync/remote` / `POST /api/sync/force`
- `POST /api/refresh`

All read endpoints also support `start=YYYY-MM-DD&end=YYYY-MM-DD` instead of `range`, plus `timeZone` (IANA name).

## Notes

- The frontend is display-only and fetches all usage data through the Hono BFF.
- If no OpenCode data is found, the UI renders an empty state instead of failing.
- Estimated cost is computed from model pricing data instead of trusting local message payload cost fields.
