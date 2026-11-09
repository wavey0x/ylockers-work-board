# yLockers Work Board

A static, read-only public view of the private yLockers team board. Vercel builds and serves the frontend from GitHub. An hourly systemd job on Electro publishes a filtered JSON file, served by Caddy and proxied through Vercel. No running app backend, database, container, visitor accounts or admin controls.

## Local development

Requires Node 24 or newer. Python 3 runs the failure notifier and its tests.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5178. The preview starts empty. Configure the credential in `.env`, then run `npm run sync` to populate the local `data/board.json`. The dev server reads this file without connecting to GitHub. `npm run build` builds only the frontend; it never copies runtime board data into `dist/`.

## GitHub access

Set `BOARD_GITHUB_TOKEN` to a dedicated credential with organization Projects read access and access to the underlying private issues. A classic PAT needs `read:project` and `repo`; an organization-approved fine-grained PAT needs Projects read and repository Issues/Pull requests read permissions. Authorize organization SSO if required. Never put credentials in a `VITE_` variable or the public directory. See [GitHub's Projects API authentication documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#authentication).

Defaults: organization `yLockers`, project `2`, single-select field `Project`. Allowed categories are `yFactory`, `yYB`, `yCRV`, `Resupply`, `Tools`, and `Operations`.

`GITHUB_REPOSITORIES` lists every private repository used by the board, separated by commas. Before each sync, the job checks Issues and Pull requests access without downloading their contents. This prevents GitHub's silently filtered empty response from erasing the published board when repository access is missing. Update the list when adding a new source repository.

## Publication rules

- Only explicitly allowed categories publish. Unclassified, unknown and archived items stay private.
- yRisk in the category, title, repository name or labels excludes an item, even in an allowed category.
- Export only title, status, category, assignee logins and an opaque generated identifier. Never export descriptions, comments, attachments, source URLs or raw GitHub IDs.
- Complete every source page and validate all eligible items before writing. Incomplete metadata, inaccessible items, GraphQL errors and unexpected statuses stop publication.
- Rebuild the final JSON from allowed fields, then replace `board.json` atomically. Failures retain the last successful snapshot. Raw source responses are never saved or logged.
- Successful runs remove deleted, archived or reclassified items. Classification changes take effect on the next successful run; copies of previously published data cannot be recalled.

Automatic publication assumes titles in allowed categories are suitable for public viewing. A misclassified sensitive item without a recognizable private marker cannot be identified automatically. Keep the original GitHub project and source repositories private.

## Frontend deployment: Vercel

Use the **wavey0x** Vercel account and **wavey0x's projects** team. Check `vercel whoami` before creating, linking or deploying anything; do not use another account's default CLI session.

Connect [wavey0x/ylockers-work-board](https://github.com/wavey0x/ylockers-work-board) to the `ylockers-work-board` Vercel project. Pushes to `main` deploy production automatically; other branches get previews. The checked-in `vercel.json` selects Vite, `npm ci`, `npm run build` and `dist/`. No environment variables or private GitHub access are needed on Vercel.

Add `ylockers-work-board.wavey.info` to the project's domains and point its DNS CNAME to the exact target shown by Vercel. Keep `api.wavey.info` pointed at Electro. Verify the Vercel deployment and its `/board.json` before changing DNS.

`/board.json` is rewritten to `https://api.wavey.info/ylockers-work-board/board.json`, which contains only the filtered public snapshot. Both layers disable caching for this response. Board updates do not require a frontend deployment, and preview deployments use the same public data. The page refreshes data every minute and marks it delayed after two hours without a successful sync. See [Vercel's Git integration](https://vercel.com/docs/git) and [external rewrites](https://vercel.com/docs/routing/rewrites).

`.vercelignore` allows only build inputs during CLI uploads. Runtime data, credentials and local deployment metadata are excluded. Never add the private board token or Telegram credential to Vercel, GitHub Actions, build settings or frontend variables.

## Data deployment: Electro

Import `deploy/Caddy-data.caddy` **inside** the existing `api.wavey.info` Caddy site block. It serves exactly `/ylockers-work-board/board.json`, not the data directory. Validate the full Caddy configuration and reload after changes.

| Location | Purpose |
| --- | --- |
| `/opt/ylockers-work-board/scripts/` and `sync/` | Sync code; not web-accessible |
| `/var/lib/ylockers-work-board/board.json` | Public, filtered snapshot |
| `/etc/ylockers-work-board.env` | GitHub credential; root-owned, mode `0600` |
| `/etc/ylockers-work-board-alerts.env` | Telegram bot credential and alert chat ID; root-owned, mode `0600` |

Copy the `scripts/` and `sync/` directories into `/opt/ylockers-work-board/` when updating the sync job. The job uses only Node built-ins; no runtime dependency installation is needed. Frontend auto-deploys do not update this separate server job.

Create the system user `ylockers-board` and its writable data directory before starting the job:

```sh
sudo useradd --system --home-dir /var/lib/ylockers-work-board --no-create-home --shell /usr/sbin/nologin ylockers-board
sudo install -d -o ylockers-board -g ylockers-board -m 0755 /var/lib/ylockers-work-board
sudo install -m 0600 .env.example /etc/ylockers-work-board.env
sudoedit /etc/ylockers-work-board.env
```

Set the credential in that file. The systemd service sets the production output path independently of the environment file. Install the units and run a first sync:

```sh
sudo install -m 0644 deploy/ylockers-work-board.service deploy/ylockers-work-board.timer deploy/ylockers-work-board-alert@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start ylockers-work-board.service
sudo systemctl enable --now ylockers-work-board.timer
```

Never serve the source checkout or the whole data directory. JSON responses use `Cache-Control: no-store`. Electro hosts only the public snapshot for this app; the frontend and its custom hostname are served by Vercel.

During the DNS transition, `deploy/Caddy-transition.caddy` can temporarily forward clients still using Electro's cached IP to Vercel. It stores no frontend files and uses Vercel's DNS target directly, with the public hostname for HTTP and verified TLS, to avoid a proxy loop. Remove its import after old DNS caches have expired; retain the separate data route.

The timer runs hourly and catches up after downtime. Systemd prevents overlapping runs of the same service. Failed attempts leave the old snapshot in place and try again at the next scheduled hour. Read the [systemd timer documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html) and [Caddy static-file documentation](https://caddyserver.com/docs/caddyfile/directives/file_server) for host configuration details.

For maintenance:

```sh
sudo systemctl start ylockers-work-board.service
systemctl list-timers ylockers-work-board.timer
sudo journalctl -u ylockers-work-board.service --since today
```

Manual starts are a server maintenance command; there is no public sync API. Service logs contain counts, timestamps and generic failures, never task titles or credentials. Data survives frontend updates because it lives outside the web directory. Back up the data and credential file privately.

### Failure alerts

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `/etc/ylockers-work-board-alerts.env`, using `deploy/alerts.env.example` as the template. The bot must already be in the intended alert group. Keep the file root-owned with mode `0600`; install `scripts/notify_failure.py` alongside the sync command.

The sync service's `OnFailure=` hook starts a separate notification service after errors, crashes or timeouts. The notification contains only the app name, a generic failure category and the public link. It includes no task contents, source errors or journal excerpts. Failed Telegram delivery retries every minute until accepted; successful updates send nothing. As with other HTTP notifications, a lost acknowledgement can result in a duplicate retry.

To verify the hook with a clearly labelled test notification, run:

```sh
sudo systemd-run --unit=ylockers-work-board-alert-test --property=OnFailure=ylockers-work-board-alert@ylockers-work-board-alert-test.service.service /usr/bin/false
```

The test unit intentionally fails without touching board data. Confirm the test message in the intended group, then reset the test unit's failed state.

## Verification and repository privacy

```sh
npm test
npm run build
```

Tests use invented tasks and cover filtering, field allowlisting, complete pagination, failed-sync preservation, removal reconciliation and the standalone command. No real snapshots are included. Git ignores `.env`, runtime data, preview artifacts and backups. Inspect staged files before pushing; ignore rules do not protect previously tracked files.
