# Purpose

Use this guide to connect a new machine to the existing OpenCode token dashboard sync setup.

The Cloudflare Worker and D1 database are already provisioned. A new machine only needs the app code, a local `.env.local`, and a daemon restart.

# Existing Cloudflare Setup

Worker URL:

```text
https://opencode-dashboard-sync.changehow1122.workers.dev
```

D1 database:

```text
opencode-dashboard-sync
```

Worker secret name:

```text
SYNC_TOKEN
```

The local app uses the same token value through `.env.local` as `SYNC_TOKEN`.

# Required Secret

Cloudflare Worker secrets cannot be read back after they are set.

Get the current `SYNC_TOKEN` from an already configured trusted machine:

```bash
cd /Users/changehow/workspace/opencode-token-dashboard
grep '^SYNC_TOKEN=' .env.local
```

Do not commit `.env.local`. Do not paste the token into public chats, issues, PRs, or logs.

If the token is lost, rotate it by setting a new Worker secret and updating `.env.local` on every machine.

# Add A New Machine

Clone or update the repository on the new machine:

```bash
git clone https://github.com/ChangeHow/opencode-token-dashboard.git
cd opencode-token-dashboard
pnpm install
```

Create `.env.local` in the repository root:

```bash
cat > .env.local <<'EOF'
SYNC_ENDPOINT=https://opencode-dashboard-sync.changehow1122.workers.dev
SYNC_TOKEN=REPLACE_WITH_CURRENT_SYNC_TOKEN
SYNC_MACHINE_LABEL=REPLACE_WITH_HUMAN_READABLE_MACHINE_NAME
EOF
```

Ask the user for a short label that identifies the machine. If they are unsure, suggest names based on the device type, location, or hostname, for example:

```text
MacBook-Pro
Office-Mac
Home-iMac
```

Do not choose the final label without user confirmation.

Build and start the dashboard:

```bash
pnpm build
pnpm daemon:restart
```

For LAN access from other devices, start the daemon with an explicit host:

```bash
pnpm daemon:stop
node ./scripts/daemon.mjs --host 0.0.0.0 --port 8787
```

# Verify Sync

Verify the local dashboard sees sync as enabled and fresh:

```bash
curl -sf http://127.0.0.1:8787/api/dashboard | jq '.remoteSync.enabled, .remoteSync.status'
```

Expected output:

```text
true
"fresh"
```

Verify the Worker accepts the configured token:

```bash
set -a
source .env.local
set +a
curl -sf -H "Authorization: Bearer $SYNC_TOKEN" "$SYNC_ENDPOINT/api/sync/usage" | jq '.machines, (.rows | length)'
```

The `machines` list should include the machines that have pushed data. The row count should be greater than zero after at least one machine has synced usage.

# Agent Checklist

When an agent is asked to add a new machine, it should do the following:

- Confirm the repository path on the new machine.
- Obtain `SYNC_TOKEN` from the user or from an existing local `.env.local`; never print it back.
- Create or update `.env.local` with `SYNC_ENDPOINT`, `SYNC_TOKEN`, and `SYNC_MACHINE_LABEL`.
- Run `pnpm install` if dependencies are missing.
- Run `pnpm build`.
- Start the daemon with either `pnpm daemon:restart` or `node ./scripts/daemon.mjs --host 0.0.0.0 --port 8787`.
- Verify `/api/dashboard` returns `remoteSync.enabled: true` and `remoteSync.status: fresh`.
- Verify the Worker returns HTTP 200 with the bearer token.
- Do not commit `.env.local` or any token value.

# Troubleshooting

If `/api/dashboard` returns `remoteSync.enabled: false`, check `.env.local` exists in the repository root and includes both `SYNC_ENDPOINT` and `SYNC_TOKEN`.

If the Worker returns `401`, the local `SYNC_TOKEN` does not match the Worker secret. Copy the token again from a configured machine, or rotate the Worker secret and update all machines.

If the Worker returns `200` but no remote machines appear in the dashboard, this can be normal on a single-machine setup. The dashboard excludes the current machine from remote summaries, so remote data appears after another machine syncs.

If the daemon starts but does not serve requests, inspect the logs:

```bash
tail -n 100 logs/bff.log
tail -n 100 logs/bff-error.log
```
