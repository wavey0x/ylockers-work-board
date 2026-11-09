# yLockers Work Board

A static, read-only public view of the private yLockers team board. The team updates its existing GitHub project; an hourly systemd job publishes a filtered JSON file. Caddy serves the website and that file directly. No running app backend, database, container, visitor accounts or admin controls.

## Local development

Requires Node 24 or newer.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5178. The preview starts empty. Configure the credential in `.env`, then run `npm run sync` to populate the local `data/board.json`. The dev server reads this file without connecting to GitHub. `npm run build` builds only the frontend; it never copies runtime board data into `dist/`.

## GitHub access

Set `BOARD_GITHUB_TOKEN` to a dedicated credential with organization Projects read access and access to the underlying private issues. A classic PAT needs `read:project` and `repo`; an organization-approved fine-grained PAT needs Projects read and repository Issues/Pull requests read permissions. Authorize organization SSO if required. Never put credentials in a `VITE_` variable or the public directory. See [GitHub's Projects API authentication documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#authentication).

Defaults: organization `yLockers`, project `2`, single-select field `Project`. Allowed categories are `yFactory`, `yYB`, `yCRV`, `Resupply`, `Tools`, and `Operations`.

## Publication rules

- Only explicitly allowed categories publish. Unclassified, unknown and archived items stay private.
- yRisk in the category, title, repository name or labels excludes an item, even in an allowed category.
- Export only title, status, category, assignee logins and an opaque generated identifier. Never export descriptions, comments, attachments, source URLs or raw GitHub IDs.
- Complete every source page and validate all eligible items before writing. Incomplete metadata, inaccessible items, GraphQL errors and unexpected statuses stop publication.
- Rebuild the final JSON from allowed fields, then replace `board.json` atomically. Failures retain the last successful snapshot. Raw source responses are never saved or logged.
- Successful runs remove deleted, archived or reclassified items. Classification changes take effect on the next successful run; copies of previously published data cannot be recalled.

Automatic publication assumes titles in allowed categories are suitable for public viewing. A misclassified sensitive item without a recognizable private marker cannot be identified automatically. Keep the original GitHub project and source repositories private.

## Electro deployment

The supplied Caddy site serves `ylockers-work-board.wavey.info`. Point that hostname's DNS at the host and allow Caddy to obtain HTTPS certificates.

| Location | Purpose |
| --- | --- |
| `/opt/ylockers-work-board/scripts/` and `sync/` | Sync code; not web-accessible |
| `/var/www/ylockers-work-board/` | Built frontend only |
| `/var/lib/ylockers-work-board/board.json` | Public, filtered snapshot |
| `/etc/ylockers-work-board.env` | GitHub credential; root-owned, mode `0600` |

Build with `npm ci && npm run build`. Copy `dist/` into the web directory, and the `scripts/` and `sync/` directories into `/opt/ylockers-work-board/`. The sync job uses only Node built-ins; no runtime dependency installation is needed.

Create the system user `ylockers-board` and its writable data directory before starting the job:

```sh
sudo useradd --system --home-dir /var/lib/ylockers-work-board --no-create-home --shell /usr/sbin/nologin ylockers-board
sudo install -d -o ylockers-board -g ylockers-board -m 0755 /var/lib/ylockers-work-board
sudo install -m 0600 .env.example /etc/ylockers-work-board.env
sudoedit /etc/ylockers-work-board.env
```

Set the credential in that file. The systemd service sets the production output path independently of the environment file. Install the units and run a first sync:

```sh
sudo install -m 0644 deploy/ylockers-work-board.service deploy/ylockers-work-board.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start ylockers-work-board.service
sudo systemctl enable --now ylockers-work-board.timer
```

Import `deploy/Caddyfile` from the existing Caddy configuration, validate it, then reload Caddy. Serve only the compiled frontend and the exact `/board.json` route; never serve the source checkout or the whole data directory. JSON responses use `Cache-Control: no-store`. The page reads the saved JSON every minute and marks it delayed after two hours without an update.

The timer runs hourly and catches up after downtime. Systemd prevents overlapping runs of the same service. Failed attempts leave the old snapshot in place and try again at the next scheduled hour. Read the [systemd timer documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html) and [Caddy static-file documentation](https://caddyserver.com/docs/caddyfile/directives/file_server) for host configuration details.

For maintenance:

```sh
sudo systemctl start ylockers-work-board.service
systemctl list-timers ylockers-work-board.timer
sudo journalctl -u ylockers-work-board.service --since today
```

Manual starts are a server maintenance command; there is no public sync API. Service logs contain counts, timestamps and generic failures, never task titles or credentials. Data survives frontend updates because it lives outside the web directory. Back up the data and credential file privately.

## Verification and repository privacy

```sh
npm test
npm run build
```

Tests use invented tasks and cover filtering, field allowlisting, complete pagination, failed-sync preservation, removal reconciliation and the standalone command. No real snapshots are included. Git ignores `.env`, runtime data, preview artifacts and backups. Inspect staged files before pushing; ignore rules do not protect previously tracked files.
