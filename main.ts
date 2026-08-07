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

async function sha1(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashFromDownloadUrl(downloadUrl: string): Promise<string | null> {
  const r = await fetch(downloadUrl, { redirect: "follow" });
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  // Reuse the parser above but do sha1 async
  let i = 0, infoStart = -1, infoEnd = -1;
  const td = new TextDecoder("utf-8");
  const readIntUntil = (term: number) => {
    let s = "";
    while (buf[i] !== term) { s += String.fromCharCode(buf[i++]); }
    i++; return parseInt(s, 10);
  };
  const parse = () => {
    const c = buf[i];
    if (c === 0x69) { i++; readIntUntil(0x65); return; }
    if (c === 0x6c) { i++; while (buf[i] !== 0x65) parse(); i++; return; }
    if (c === 0x64) {
      i++;
      while (buf[i] !== 0x65) {
        // key is bytestring
        const kLen = readIntUntil(0x3a);
        const key = td.decode(buf.subarray(i, i + kLen));
        i += kLen;
        const vStart = i; parse(); const vEnd = i;
        if (key === "info") { infoStart = vStart; infoEnd = vEnd; }
      }
      i++; return;
    }
    if (c >= 0x30 && c <= 0x39) {
      const len = readIntUntil(0x3a);
      i += len; return;
    }
    throw new Error("bencode error at " + i);
  };
  try { parse(); } catch { return null; }
  if (infoStart < 0) return null;
  return await sha1(buf.subarray(infoStart, infoEnd));
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
  if (url.pathname === "/hash-from-url") {
    const dl = url.searchParams.get("url");
    if (!dl) return json({ error: "url required" }, 400);
    try {
      const h = await hashFromDownloadUrl(dl);
      return h ? json({ hash: h }) : json({ error: "no info dict" }, 422);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }
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
