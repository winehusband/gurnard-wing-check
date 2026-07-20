// bramble-proxy: live Bramblemet (mid-Solent buoy) wind as JSON.
//
// KNOWN ISSUE (confirmed 20 Jul 2026): bramblemet.co.uk was redesigned at some point
// and no longer publishes a plain-text/CSV data feed. The historical URL this function
// targets (https://www.bramblemet.co.uk/bra.csv) 404s, as do every other CSV/data-feed
// path tried (bramble.csv, data.csv, GetData.ashx, /data/, /live/, /feed/, case variants,
// http/non-www variants). The site's Wind page (https://www.bramblemet.co.uk/wind.aspx)
// now serves the reading only as a server-rendered chart image
// (GetImage.ashx?src=braws.gif / brawd.gif) with no accompanying numeric feed — confirmed
// by inspecting live network requests, which show only image/CSS/JS fetches, no XHR/JSON.
// The chart image itself DOES show genuine live data (confirmed by screenshot matching
// the current time), so the buoy and its telemetry are alive — it's just not exposed as
// data anymore.
//
// No CSV/JSON replacement feed was found for any of the sibling Solentmet sites
// (chimet, cambermet, emsmet, sotonmet) or via Southampton VTS. A candidate fallback
// (Open-Meteo forecast API, the same pattern used by the water-temp-proxy sibling
// function) was test-queried for this location and returned a wind DIRECTION reading
// ~90 degrees off the live Bramblemet chart at the same moment — too large a discrepancy
// to substitute silently in an app that scores ride safety by direction band.
//
// Until a real numeric feed is identified (or a decision is made to accept a modelled
// fallback with clear "modelled, not observed" labelling — which would require a
// contract change, since the current response shape has no room for a source/confidence
// field), this function will reach the upstream 404 and correctly return its documented
// HTTP 502 { error } fallback. The parser below is kept in place, unmodified in spirit
// from the task brief, so it starts working the moment a compatible CSV feed exists at
// FEED_URL (or FEED_URL is swapped to wherever one turns up).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const FEED_URL = 'https://www.bramblemet.co.uk/bra.csv';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { expiresAt: number; body: string } | null = null;

function findCol(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h.trim().toUpperCase()));
}

function parseFeed(csv: string): { windKts: number; gustKts: number; dirDeg: number; at: string } {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('feed too short');
  const header = lines[0].split(',');
  const wCol = findCol(header, ['WSPD', 'WINDSPEED', 'WIND_SPEED']);
  const gCol = findCol(header, ['GST', 'GUST', 'WGUST']);
  const dCol = findCol(header, ['WD', 'WDIR', 'WIND_DIR']);
  if (wCol < 0 || dCol < 0) throw new Error('wind columns not found in header: ' + lines[0]);
  const last = lines[lines.length - 1].split(',');
  const windKts = Number(last[wCol]);
  const gustKts = gCol >= 0 ? Number(last[gCol]) : windKts;
  const dirDeg = Number(last[dCol]);
  if (!Number.isFinite(windKts) || !Number.isFinite(dirDeg)) throw new Error('bad row: ' + lines[lines.length - 1]);
  return { windKts, gustKts, dirDeg, at: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
  try {
    if (cached && Date.now() < cached.expiresAt) {
      return new Response(cached.body, { headers: jsonHeaders });
    }
    const resp = await fetch(FEED_URL);
    if (!resp.ok) throw new Error('feed HTTP ' + resp.status);
    const body = JSON.stringify(parseFeed(await resp.text()));
    cached = { expiresAt: Date.now() + CACHE_TTL_MS, body };
    return new Response(body, { headers: jsonHeaders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: jsonHeaders });
  }
});
