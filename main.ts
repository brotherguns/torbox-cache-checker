// AIO server: serves index.html, proxies TorBox, proxies Prowlarr.
//
// Env:
//   PORT              (default 8000)
//   PROWLARR_URL      (default http://prowlarr:9696)
//   PROWLARR_API_KEY  (get from Prowlarr → Settings → General → API Key)

const TORBOX = "https://api.torbox.app";
const PROWLARR_URL = Deno.env.get("PROWLARR_URL") ?? "http://prowlarr:9696";
const PROWLARR_API_KEY = Deno.env.get("PROWLARR_API_KEY") ?? "";
const PORT = Number(Deno.env.get("PORT") ?? 8000);

let indexHtml: string | null = null;
async function loadIndex() {
  if (indexHtml === null) indexHtml = await Deno.readTextFile("./index.html");
  return indexHtml;
}

async function proxyTorbox(req: Request, url: URL) {
  const target = TORBOX + url.pathname + url.search;
  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

async function proxyProwlarr(req: Request, url: URL) {
  if (!PROWLARR_API_KEY) {
    return json({ error: "PROWLARR_API_KEY not set on server" }, 500);
  }
  const path = url.pathname.replace(/^\/prowlarr/, "");
  const outUrl = new URL(PROWLARR_URL + path + url.search);
  outUrl.searchParams.set("apikey", PROWLARR_API_KEY);
  const upstream = await fetch(outUrl, {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json" },
  });
}

async function resolveImdb(id: string) {
  // Uses IMDb's public suggestion endpoint (same one their own site autocomplete hits).
  const url = `https://v3.sg.media-imdb.com/suggestion/t/${id}.json`;
  const r = await fetch(url);
  if (!r.ok) return json({ error: "imdb resolve failed", status: r.status }, 502);
  const j = await r.json();
  const hit = (j.d || []).find((x: any) => x.id === id) || (j.d || [])[0];
  if (!hit) return json({ error: "not found" }, 404);
  const isSeries = /series|TV/i.test(hit.qid || hit.q || "");
  return json({ id, title: hit.l, year: hit.y, kind: isSeries ? "tv" : "movie" });
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/health") return json({ ok: true, prowlarr: !!PROWLARR_API_KEY });
  const imdb = url.pathname.match(/^\/resolve-imdb\/(tt\d+)$/);
  if (imdb) return resolveImdb(imdb[1]);
  if (url.pathname.startsWith("/prowlarr/")) return proxyProwlarr(req, url);
  if (url.pathname.startsWith("/v1/")) return proxyTorbox(req, url);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(await loadIndex(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new Response("Not found", { status: 404 });
});

console.log(`Listening on :${PORT} · Prowlarr key: ${PROWLARR_API_KEY ? "set" : "MISSING"}`);
