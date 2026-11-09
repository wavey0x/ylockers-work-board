# yLockers Work Board

A self-hosted, read-only public view of the private yLockers team board. React frontend, a small Node HTTP server, and one persistent JSON snapshot. No OpenAI hosting, external database, analytics, or visitor accounts.

The team keeps updating its existing GitHub board. The server reads that board hourly and publishes only selected fields from eligible items. The Sync button allows an authorized maintainer to refresh on demand.

## Run locally

Requires Node 24 or newer.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5178. A fresh installation shows an empty board until its first successful sync. No real tasks or saved source snapshots are bundled with the app.

## Connect the source

Set `BOARD_GITHUB_TOKEN` in `.env` to a dedicated credential with read access to organization Projects and the underlying private issues. For a classic PAT, that means `read:project` and `repo`; for an organization-approved fine-grained PAT, grant Projects read permission and repository Issues/Pull requests read access. Authorize organization SSO if required. Prefer a dedicated narrowly scoped credential where your GitHub organization permits it.

Generate `ADMIN_SYNC_TOKEN` with at least 32 random characters and store it in `.env`. For example, generate one locally with `openssl rand -hex 32`. The sync dialog uses this key for that request only, keeps it out of URLs, and does not persist it in the browser. Never use a `VITE_` environment variable for credentials.

Default source: organization `yLockers`, project `2`, single-select field `Project`. Eligible values: `yFactory`, `yYB`, `yCRV`, `Resupply`, `Tools`, `Operations`.

Once configured, the running server syncs on startup if due, then one hour after each successful sync. It retries failed attempts after 15 minutes and retains the last complete snapshot. A manual sync resets the timer. Set `SYNC_INTERVAL_HOURS` to change the interval. The timer survives server restarts through the private state file; run one server replica per data directory. The process must stay running for unattended updates.

## Publication rules

- Only the explicitly listed Project categories are eligible. Missing or unknown categories stay private. No extra per-item approval field is required.
- yRisk in the project category, title, repository name, or labels always excludes an item, even if it otherwise matches an allowed category.
- Publish only title, status, category, assignee logins, and an opaque generated card identifier. Descriptions, comments, attachments, source URLs, and raw GitHub node IDs are never exported.
- Archived items are omitted. Done items remain visible until archived or removed from the source board.
- Read all pages before replacing the snapshot. GraphQL errors, lost access, missing field definitions, incomplete metadata, and unexpected statuses stop publication.
- Each successful sync replaces the public dataset, so removed or reclassified items disappear. Previously published information can still exist in visitors' copies.
- Raw source payloads are neither persisted nor logged. Only sanitized data reaches the browser. The default production server serves `dist/` and designated API responses; `.env`, `server/`, and `data/` are not web directories.
- Stored snapshots are checked again before serving: only the current allowed categories and explicit public fields can leave the API. Unsupported older snapshot formats are rejected.

The automatic rule assumes titles in the selected yLockers categories are suitable for public viewing. Classify sensitive cross-team work as yRisk or a non-public category before adding it to the board. New source categories require an explicit configuration update to become public. A misclassified item without a recognizable private marker cannot be identified automatically. Classification changes reach the public view on the next successful sync; a failed sync retains the previous view.

## Host it yourself

```sh
npm ci
npm run build
npm start
```

The production server listens on `127.0.0.1:8080` by default. Put it behind your existing HTTPS reverse proxy. For example, a Caddy site block can use `reverse_proxy 127.0.0.1:8080` under your chosen domain. Do not expose the Vite development server in production.

Or run the included container:

```sh
docker compose up -d --build
```

The container uses a persistent named volume for snapshots, binds its host port to loopback, and runs as a non-root user. Back up the volume. HTTPS belongs at the reverse proxy. No OpenAI services are required.

### Storage and scheduling

Run one container on your host behind its existing HTTPS proxy. The built-in timer performs the hourly sync; a separate cron job is unnecessary. Visitors read the saved public snapshot, not GitHub.

| File | Contents | Location |
| --- | --- | --- |
| `board.json` | Filtered public cards and last successful sync time | Persistent `board-data` volume, mounted at `/app/data` |
| `sync.json` | Private scheduler state and latest error | Same volume; never served directly |
| Environment file | GitHub credential and admin sync key | Host only; excluded from Git and the image |

For credentials outside the checkout, create a restricted file on the host, then launch with `BOARD_ENV_FILE=/etc/ylockers-work-board.env docker compose up -d --build`. The default is the ignored `.env` file. The runtime writes snapshots atomically with owner-only permissions. Rebuilding the app preserves the volume; `docker compose down -v` deletes it.

### Publishing this repository

Publish the application source only. `.gitignore` and `.dockerignore` exclude credentials, runtime data, preview artifacts, backups and dependency folders. Tests use invented tasks. Before each push, inspect the staged files; ignore rules do not protect files that were already tracked. Keep the original GitHub project and its repositories private. This app does not change their visibility.

## Manual sync

Use the Sync button and admin key, or run `npm run sync` alongside the configured server. For a remote instance, set `BOARD_URL` to its HTTPS origin. Admin routes require a bearer key; the public API never returns source credentials or detailed sync errors.

The protected `GET /api/admin/status` route reports the latest attempt, success, error and next scheduled run. Public `GET /api/board` provides the filtered snapshot and freshness metadata. `POST /api/admin/sync` performs an authenticated sync. The UI rechecks the published snapshot every minute; this does not request another GitHub sync.

## Verify

```sh
npm test
npm run build
```

Tests cover yRisk exclusion, unclassified items, field allowlisting at both boundaries, pagination failures, retaining the last valid snapshot, removal reconciliation, scheduling and protection of admin routes and private files.
