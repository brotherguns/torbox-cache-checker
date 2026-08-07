# TorBox Bulk Cache Checker + Prowlarr

Search Prowlarr → auto-check TorBox cache → one-click add cached torrents to your account.
No seeding required.

## Local setup (5 min)

**Requires:** Docker + Docker Compose.

```bash
git clone https://github.com/brotherguns/torbox-cache-checker
cd torbox-cache-checker
docker compose up -d
```

1. Open **http://localhost:9696** — this is Prowlarr.
   - Create an admin account when prompted.
   - Add TorrentLeech: **Indexers → Add** → search "TorrentLeech" → enter your username, password, and (if enabled) 2FA.
   - Add any public indexers you want too (1337x, YTS, TPB, etc.).
   - Go to **Settings → General → Security** and copy the **API Key**.

2. Add the API key to Docker and restart the checker:
   ```bash
   echo 'PROWLARR_API_KEY=<paste-key-here>' > .env
   docker compose up -d
   ```

3. Open **http://localhost:3000** — this is the checker.
   - Paste your **TorBox API key**, click Save.
   - Search tab: type a title → results come back with a `cached` / `uncached` pill next to each.
   - Cached results get an **Add** button that sends the magnet to your TorBox account instantly.

## What's in the repo

- `index.html` — UI (Search + Upload tabs).
- `main.ts` — Deno server. Serves the UI, proxies `/v1/api/*` to TorBox and `/prowlarr/api/*` to Prowlarr.
- `docker-compose.yml` — runs Prowlarr and the checker together.
- `worker.js` — standalone Cloudflare Worker CORS proxy (only needed if you host `index.html` separately).

## Public deployment (upload-only mode)

Deno Deploy works for the file-upload flow (no Prowlarr — that stays local):

1. Push repo to GitHub → https://dash.deno.com/new_project → entrypoint `main.ts`.
2. Site is at `https://<name>.deno.dev`. Search tab won't work (no Prowlarr reachable) but Upload tab does.
