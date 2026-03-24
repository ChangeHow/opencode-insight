# OpenCode Token Dashboard

Local-first token usage dashboard for OpenCode sessions.

Built with:

- React
- TanStack Router
- shadcn/ui-style components
- Jotai
- Hono
- pnpm workspace
- Node 24

## Requirements

- Node 24
- pnpm 10+
- `sqlite3` CLI available in `PATH`
- Local OpenCode data

The BFF reads OpenCode usage from the directory configured in `.env.local`.
It queries `opencode.db` through the system `sqlite3` binary, so there is no Node native SQLite rebuild step.

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

- `GET /api/summary?range=30d|60d|90d`
- `GET /api/heatmap?range=30d|60d|90d`
- `GET /api/trend?range=30d|60d|90d`
- `GET /api/series?range=30d|60d|90d&series=provider::model`
- `GET /api/day/:date?range=30d|60d|90d`
- `POST /api/refresh`

All read endpoints also support `start=YYYY-MM-DD&end=YYYY-MM-DD` instead of `range`.

## Notes

- The frontend is display-only and fetches all usage data through the Hono BFF.
- If no OpenCode data is found, the UI renders an empty state instead of failing.
- Estimated cost is computed from model pricing data instead of trusting local message payload cost fields.
