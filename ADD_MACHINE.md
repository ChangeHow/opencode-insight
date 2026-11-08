# Connect another machine

Optional remote sync combines aggregate usage from your own machines. First provision your own Cloudflare Worker and D1 database from `workers/sync`, replace `database_id` in its Wrangler configuration, and configure the Worker's `SYNC_TOKEN` secret. No shared deployment or credentials are provided by this repository.

On each machine, follow the [dashboard setup](README.md#dashboard), then add these values to the local `.env.local`:

```dotenv
SYNC_ENDPOINT=https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
SYNC_TOKEN=REPLACE_WITH_YOUR_SYNC_TOKEN
SYNC_MACHINE_LABEL=REPLACE_WITH_YOUR_MACHINE_LABEL
```

Use the same token across your own Worker and machines, with a distinct label for each machine. Transfer it through a trusted secret manager, not terminal output, chat, issues, or logs. Keep `.env.local` outside version control.

Sync uploads daily provider/model aggregates and machine identifiers/labels, not message bodies. Treat those aggregates and labels as private data too.

# Start and verify

From the repository root:

```bash
pnpm build
node scripts/opendash.mjs server
curl -sf http://127.0.0.1:8787/api/dashboard | jq '.remoteSync.enabled, .remoteSync.status'
```

After the first successful sync, expect `true` and `"fresh"`. The dashboard excludes the current machine from remote summaries, so another machine must sync before remote totals appear.

If the dashboard is already running, stop it with `node scripts/opendash.mjs stop` before starting it again to load updated environment values. The dashboard has no authentication; keep its default loopback binding and do not expose it to an untrusted network.

# Troubleshooting

- **Sync disabled:** check that `.env.local` contains both `SYNC_ENDPOINT` and `SYNC_TOKEN`.
- **HTTP 401:** ensure every machine and the Worker use the same token. Rotate the Worker secret and update all machines if the token is lost or exposed.
- **No remote machines:** confirm that at least one other machine has successfully synced.
- **Startup failure:** inspect `logs/bff.log` and `logs/bff-error.log` locally; redact paths and usage data before sharing logs.
