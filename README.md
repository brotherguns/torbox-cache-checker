# TorBox Bulk Cache Checker

Drop `.torrent` files → get a cached / uncached table using the TorBox API.

## Deploy (one repo, one deploy)

1. Go to <https://dash.deno.com/new_project>.
2. Sign in with GitHub, pick this repo.
3. Set **entrypoint** to `main.ts`. No build command, no env vars.
4. Deploy — you get a live URL like `https://torbox-cache-checker.deno.dev`.

Every push to `main` redeploys automatically.

## Local dev

```
deno run --allow-net --allow-read main.ts
```

## Files

- `index.html` — the UI. Parses torrent files client-side, computes infohashes, calls the same-origin API proxy.
- `main.ts` — Deno server. Serves `index.html` at `/`, proxies `/v1/api/*` to `api.torbox.app`.
- `worker.js` — alternative Cloudflare Worker (CORS proxy only) if you'd rather host the HTML separately.
