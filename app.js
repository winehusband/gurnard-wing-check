'use strict';

const FN_BASE = 'https://gsucaxeqzluzbmvonsmj.supabase.co/functions/v1';
const TIDE_URL = FN_BASE + '/tide-proxy';
const BRAMBLE_URL = FN_BASE + '/bramble-proxy';
const PROFILE_STORAGE_KEY = 'wing_profile';
const TIDE_CACHE_KEY = 'wing_tide_cache_v1';
const TIDE_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const LIVE_DRIFT_RATIO = 0.3;

let spot = null;
let forecast = null;      // Open-Meteo response
let tideEvents = null;    // Admiralty array or null (degraded)
let profileKey = localStorage.getItem(PROFILE_STORAGE_KEY) || 'intermediate';

function $(id) { return document.getElementById(id); }

function setStatus(text) { $('dataStatus').textContent = text; }

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(url.split('?')[0] + ' HTTP ' + resp.status);
  return resp.json();
}

async function loadForecast() {
  const url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + spot.lat + '&longitude=' + spot.lon +
    '&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m' +
    '&daily=sunrise,sunset' +
    '&wind_speed_unit=kn&timezone=Europe%2FLondon&forecast_days=7';
  return fetchJson(url);
}

async function loadTideEvents() {
  try {
    const cached = JSON.parse(localStorage.getItem(TIDE_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < TIDE_CACHE_TTL_MS) return cached.events;
  } catch (e) { /* fall through to network */ }
  const params = new URLSearchParams({ days: '7', station: spot.tideStation });
  const events = await fetchJson(TIDE_URL + '?' + params.toString());
  if (!Array.isArray(events)) throw new Error('Unexpected tide response');
  localStorage.setItem(TIDE_CACHE_KEY, JSON.stringify({ ts: Date.now(), events }));
  return events;
}

function daylightRanges() {
  // Map each date string 'YYYY-MM-DD' -> { sunrise: ms, sunset: ms }
  const out = {};
  const d = forecast.daily;
  for (let i = 0; i < d.time.length; i++) {
    out[d.time[i]] = {
      sunrise: new Date(d.sunrise[i]).getTime(),
      sunset: new Date(d.sunset[i]).getTime(),
    };
  }
  return out;
}

function buildScoredHours() {
  const h = forecast.hourly;
  const daylight = daylightRanges();
  const hours = [];
  for (let i = 0; i < h.time.length; i++) {
    const time = new Date(h.time[i]);
    const day = h.time[i].slice(0, 10);
    const dl = daylight[day];
    const isDaylight = !!dl && time.getTime() >= dl.sunrise && time.getTime() <= dl.sunset;
    const tide = tideEvents ? WindCore.tideContext(tideEvents, time) : null;
    const hour = {
      meanKts: h.wind_speed_10m[i],
      gustKts: h.wind_gusts_10m[i],
      dirDeg: h.wind_direction_10m[i],
      daylight: isDaylight,
    };
    // Safety: scoreHour skips the offshore safety cap when dirDeg is NaN
    // (directionBand can't match a band on a non-finite direction). If any
    // of the core readings are missing/non-finite, don't let a partial
    // Open-Meteo hour slip past that cap silently — force it to 0.
    const hasValidReadings = Number.isFinite(hour.meanKts) &&
      Number.isFinite(hour.gustKts) && Number.isFinite(hour.dirDeg);
    const result = hasValidReadings
      ? WindCore.scoreHour(hour, tide, profileKey, spot)
      : { score: 0, reasons: ['No forecast data'], flags: {} };
    hours.push({
      time,
      iso: h.time[i],
      day,
      hour,
      tide,
      result,
    });
  }
  return hours;
}

function scoreClass(entry) {
  if (!entry.hour.daylight) return 'score-dark';
  if (entry.result.score >= 3.5) return 'score-green';
  if (entry.result.score >= 2) return 'score-amber';
  return 'score-red';
}

function fmtTime(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderVerdict(hours) {
  const now = Date.now();
  const current = hours.find((e) => Math.abs(e.time.getTime() - now) <= 30 * 60 * 1000) ||
    hours.find((e) => e.time.getTime() >= now);
  if (!current) return;
  const score10 = Math.round(current.result.score * 2);
  $('verdictScore').textContent = score10 + '/10';

  let text = current.result.reasons[0] || 'Conditions look ' + (score10 >= 7 ? 'good' : score10 >= 4 ? 'marginal' : 'poor') + '.';
  const upcoming = hours.filter((e) => e.time.getTime() > now && e.time.getTime() < now + 12 * 3600 * 1000);
  const better = upcoming.find((e) => e.result.score >= Math.max(3.5, current.result.score + 1));
  if (better) text += ' Turning on around ' + fmtTime(better.time) + '.';
  $('verdictText').textContent = text;
}

function renderStrip(hours) {
  const strip = $('daysStrip');
  strip.textContent = '';
  const byDay = {};
  for (const e of hours) {
    if (!e.hour.daylight) continue;
    (byDay[e.day] = byDay[e.day] || []).push(e);
  }
  for (const day of Object.keys(byDay)) {
    const block = document.createElement('div');
    block.className = 'day-block';
    const label = document.createElement('div');
    label.className = 'day-label';
    label.textContent = new Date(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    block.appendChild(label);
    const row = document.createElement('div');
    row.className = 'hour-row';
    for (const e of byDay[day]) {
      const cell = document.createElement('button');
      cell.className = 'hour-cell ' + scoreClass(e);
      cell.textContent = String(e.time.getHours());
      cell.setAttribute('aria-label', fmtTime(e.time) + ' score ' + e.result.score.toFixed(1));
      cell.addEventListener('click', () => openReasons(e));
      row.appendChild(cell);
    }
    block.appendChild(row);
    strip.appendChild(block);
  }
}

function openReasons(entry) {
  $('reasonsTitle').textContent =
    entry.time.toLocaleDateString('en-GB', { weekday: 'long' }) + ' ' + fmtTime(entry.time) +
    ' — ' + entry.result.score.toFixed(1) + '/5';
  const list = $('reasonsList');
  list.textContent = '';
  const reasons = entry.result.reasons.length ? entry.result.reasons : ['Clean conditions — nothing to warn about.'];
  for (const r of reasons) {
    const li = document.createElement('li');
    li.textContent = r;
    list.appendChild(li);
  }
  $('reasonsModal').classList.add('open');
}

async function renderLive(hours) {
  try {
    const live = await fetchJson(BRAMBLE_URL);
    const card = $('liveCard');
    card.hidden = false;
    let text = Math.round(live.windKts) + ' kts gusting ' + Math.round(live.gustKts) +
      ', from ' + Math.round(live.dirDeg) + '°. Bramble sits mid-Solent, so the beach usually reads a touch less.';
    const now = hours.find((e) => Math.abs(e.time.getTime() - Date.now()) <= 60 * 60 * 1000);
    if (now && now.hour.meanKts > 0) {
      const drift = Math.abs(live.windKts - now.hour.meanKts) / now.hour.meanKts;
      if (drift > LIVE_DRIFT_RATIO) {
        text += ' ';
        const span = document.createElement('span');
        span.className = 'live-drift';
        span.textContent = live.windKts > now.hour.meanKts
          ? 'Blowing harder than forecast — trust your eyes.'
          : 'Lighter than forecast — trust your eyes.';
        $('liveText').textContent = text;
        $('liveText').appendChild(span);
        return;
      }
    }
    $('liveText').textContent = text;
  } catch (e) {
    $('liveCard').hidden = true;
  }
}

function rerender() {
  const hours = buildScoredHours();
  renderVerdict(hours);
  renderStrip(hours);
  return hours;
}

function initToggle() {
  const container = $('skillToggle');
  const buttons = container.querySelectorAll('button');
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.profile === profileKey);
    btn.addEventListener('click', () => {
      profileKey = btn.dataset.profile;
      localStorage.setItem(PROFILE_STORAGE_KEY, profileKey);
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      rerender();
    });
  });
}

async function init() {
  $('reasonsClose').addEventListener('click', () => $('reasonsModal').classList.remove('open'));
  $('reasonsModal').addEventListener('click', (ev) => {
    if (ev.target === $('reasonsModal')) $('reasonsModal').classList.remove('open');
  });
  initToggle();

  try {
    spot = await fetchJson('spot.json');
    forecast = await loadForecast();
  } catch (e) {
    setStatus('Could not load the wind forecast. Pull to refresh or try again shortly.');
    return;
  }

  try {
    tideEvents = await loadTideEvents();
    setStatus('Forecast + Cowes tide loaded.');
  } catch (e) {
    tideEvents = null;
    setStatus('Tide data unavailable — scoring on wind alone; chop and eddy rules not applied.');
  }

  const hours = rerender();
  renderLive(hours);
}

init();
