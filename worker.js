// Cloudflare Worker — CORS proxy for the TorBox API.
// Deploy: https://workers.cloudflare.com  (Create Worker → paste this → Deploy)
// Then in the site, set "API Base" to the worker's URL, e.g.
//   https://torbox-proxy.yourname.workers.dev

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-max-age': '86400',
};

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const inUrl = new URL(req.url);
    const target = 'https://api.torbox.app' + inUrl.pathname + inUrl.search;

    const headers = new Headers();
    const auth = req.headers.get('authorization');
    if (auth) headers.set('authorization', auth);
    const ct = req.headers.get('content-type');
    if (ct) headers.set('content-type', ct);

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : req.body,
    });

    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  },
};
