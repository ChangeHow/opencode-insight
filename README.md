# OpenCode Token Dashboard

[![Node](https://img.shields.io/badge/node-%E2%89%A524-026E00?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A510-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![glibc](https://img.shields.io/badge/glibc-%E2%89%A52.31-4A90D9?logo=linux&logoColor=white)](https://www.gnu.org/software/libc/)
[![better-sqlite3](https://img.shields.io/badge/better--sqlite3-12.8-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Local-first token usage dashboard for OpenCode sessions.

## Requirements

| Dependency  | Minimum | Notes                                                               |
| ----------- | ------- | ------------------------------------------------------------------- |
| **Node.js** | 24.x    |                                                                     |
| **pnpm**    | 10+     |                                                                     |
| **glibc**   | ≥ 2.31  | Debian 11+, Ubuntu 20.04+. Alpine (musl) not supported              |
| **GCC**     | ≥ 10    | Required by `better-sqlite3` (C++20). No prebuild for older distros |

The BFF reads OpenCode usage from the directory configured in `.env.local`.
It queries `opencode.db` via the `better-sqlite3` native binding, which compiles against the system toolchain at install time. Older distributions (e.g. Debian 10, Ubuntu 18.04) ship glibc and GCC versions that are too old for this dependency.

Expected files inside that directory:

- `opencode.db`
- `storage/message/`

## Install

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
pnpm daemon:start
```

Open the dashboard at:

- Dashboard: `http://127.0.0.1:8787`

To listen on all interfaces (e.g. for LAN access):

```bash
pnpm daemon:start -- --host 0.0.0.0
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
