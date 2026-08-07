// AIO server for the TorBox bulk cache checker.
// Serves index.html and proxies /v1/api/* → https://api.torbox.app/v1/api/*
//
// Run locally:   deno run --allow-net --allow-read main.ts
// Deno Deploy:   set entrypoint to main.ts, no build step, no env vars needed.

const TORBOX = "https://api.torbox.app";
let indexHtml: string | null = null;

async function loadIndex(): Promise<string> {
  if (indexHtml === null) indexHtml = await Deno.readTextFile("./index.html");
  return indexHtml;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname.startsWith("/v1/")) {
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

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(await loadIndex(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not found", { status: 404 });
});
