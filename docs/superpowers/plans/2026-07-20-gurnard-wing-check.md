# Gurnard Wing Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-page web app that scores hourly wing-foiling windows (0–5) at Gurnard, Isle of Wight, from forecast wind, tide state, and hard-coded local knowledge, with a Beginner/Intermediate/Advanced toggle.

**Architecture:** Vanilla HTML/CSS/JS PWA, no framework, no build step — third sibling to `~/Desktop/gurnard-beach-walk` and `~/Desktop/iow-sea-swim`. All scoring logic lives in a pure UMD module `wind-core.js` (unit-tested with `node --test`); `app.js` does fetch + render only. Data: Open-Meteo (client-direct), the EXISTING Supabase `tide-proxy` edge function (Cowes station `0060`, `?days=7&station=0060`, returns a raw JSON array of Admiralty TidalEvents), and a NEW `bramble-proxy` edge function for live Bramblemet wind.

**Tech Stack:** Vanilla JS (ES2020, no modules — UMD pattern like siblings), `node:test`, Playwright (`channel: 'chrome'`), Supabase edge functions (Deno/TypeScript), Cloudflare Pages hosting.

## Global Constraints

- Working directory: `/Users/hamishnicklin/Desktop/gurnard-wing-check` (git repo already initialised; spec committed).
- Spec: `docs/superpowers/specs/2026-07-20-gurnard-wing-check-design.md`. Read it before starting.
- Match sibling-app conventions exactly: UMD wrapper for the core module, `node --test` tests in `tests/`, Playwright config with `channel: 'chrome'`, plain `fetch` with localStorage caching in `app.js`.
- Supabase project ref: `gsucaxeqzluzbmvonsmj` (base URL `https://gsucaxeqzluzbmvonsmj.supabase.co/functions/v1`).
- Safety rule (non-negotiable): offshore direction bands (`offshore: true`) may NEVER produce a score above their cap (2 for S–SSW, 3 for E–SE), regardless of wind speed. There must be a unit test proving this.
- All thresholds are first-guess values from the spec — keep them in `spot.json`/`PROFILES`, never scattered as magic numbers, so calibration is one-file edits.
- British English in all UI copy.
- Commit after every task (at minimum). No `console.log` in committed code.

---

### Task 1: Scaffold — package.json, config, spot.json

**Files:**
- Create: `package.json`, `.gitignore`, `playwright.config.js`, `CLAUDE.md`, `spot.json`
- Test: `tests/spot.test.js`

**Interfaces:**
- Produces: `spot.json` — the Gurnard config object consumed by `wind-core.js` (`spot.bands`, `spot.floodSetsDeg`, `spot.ebbSetsDeg`) and `app.js` (`spot.lat`, `spot.lon`, `spot.tideStation`).

- [ ] **Step 1: Write config files**

`package.json`:

```json
{
  "name": "gurnard-wing-check",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:e2e": "playwright test tests/e2e/wing-check.spec.js --reporter=list",
    "check": "node --check app.js && node --check wind-core.js && node --check playwright.config.js"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0"
  }
}
```

`.gitignore`:

```
node_modules/
test-results/
.DS_Store
```

`playwright.config.js`:

```js
module.exports = {
  testDir: './tests/e2e',
  use: {
    channel: 'chrome',
  },
};
```

`CLAUDE.md`:

```markdown
# Gurnard Wing Check

Single-spot wing-foiling conditions app for Gurnard, IoW. Sibling of
~/Desktop/gurnard-beach-walk and ~/Desktop/iow-sea-swim — follow their patterns.

Rules:
- All scoring logic in wind-core.js (pure, UMD, unit-tested). app.js = fetch + render only.
- Tunable numbers live in spot.json or WindCore.PROFILES only. Log real sessions in CALIBRATION.md.
- Offshore bands are safety-capped; never weaken this without an explicit instruction.
- npm test && npm run check before every commit.
```

`spot.json`:

```json
{
  "id": "gurnard",
  "name": "Gurnard",
  "lat": 50.7679,
  "lon": -1.3208,
  "tideStation": "0060",
  "tideStationName": "Cowes",
  "floodSetsDeg": 70,
  "ebbSetsDeg": 250,
  "bands": [
    { "name": "Cross-shore SW", "from": 210, "to": 260, "penalty": 0, "cap": 5, "offshore": false, "note": "Prime — cross-shore, the good stuff" },
    { "name": "Cross-on W–NW", "from": 260, "to": 330, "penalty": 0.3, "cap": 5, "offshore": false, "note": "Good — a little chop rolling in" },
    { "name": "Onshore N–NE", "from": 330, "to": 50, "penalty": 0.7, "cap": 4.5, "offshore": false, "note": "Rideable but choppy onshore" },
    { "name": "Cross-off E–SE", "from": 50, "to": 130, "penalty": 0.5, "cap": 3, "offshore": true, "note": "Cross-off — caution, drift risk, don't go alone" },
    { "name": "Offshore S–SSW", "from": 130, "to": 210, "penalty": 0, "cap": 2, "offshore": true, "note": "Offshore — never ride this alone" }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`tests/spot.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('spot.json is valid and bands cover the full 360 degrees', () => {
  const spot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spot.json'), 'utf8'));
  assert.equal(spot.id, 'gurnard');
  assert.equal(spot.tideStation, '0060');
  assert.ok(Array.isArray(spot.bands) && spot.bands.length === 5);
  for (let deg = 0; deg < 360; deg++) {
    const hits = spot.bands.filter((b) =>
      b.from <= b.to ? deg >= b.from && deg < b.to : deg >= b.from || deg < b.to
    );
    assert.equal(hits.length, 1, `degree ${deg} matched ${hits.length} bands`);
  }
  const offshoreCaps = spot.bands.filter((b) => b.offshore).map((b) => b.cap);
  assert.deepEqual(offshoreCaps.sort(), [2, 3]);
});
```

- [ ] **Step 3: Install and run**

Run: `npm install && npm test`
Expected: PASS (config files already written in Step 1, so this validates them).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore playwright.config.js CLAUDE.md spot.json tests/spot.test.js
git commit -m "feat: scaffold project with Gurnard spot config"
```

---

### Task 2: wind-core.js — module skeleton + speed scoring

**Files:**
- Create: `wind-core.js`
- Test: `tests/core.test.js`

**Interfaces:**
- Produces: UMD module exposing `WindCore` global / CommonJS export with:
  - `PROFILES: { beginner, intermediate, advanced }` — each `{ min, idealLo, idealHi, upper, cap, label }`
  - `clamp(v, min, max) → number`
  - `speedScore(kts, profile) → number` (0–5)

- [ ] **Step 1: Write the failing tests**

`tests/core.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../wind-core.js');

test('speedScore: ideal band scores 5, out of range scores 0', () => {
  const p = core.PROFILES.beginner; // min 12, ideal 15-20, upper 25, cap 28
  assert.equal(core.speedScore(17, p), 5);
  assert.equal(core.speedScore(10, p), 0);
  assert.equal(core.speedScore(28, p), 0);
  assert.equal(core.speedScore(30, p), 0);
});

test('speedScore: ramps between min, ideal, upper and cap', () => {
  const p = core.PROFILES.beginner;
  assert.equal(core.speedScore(13.5, p), 3.5); // 2 + 3 * 1.5/3
  assert.equal(core.speedScore(25, p), 3);     // upper comfort -> 3
  assert.ok(core.speedScore(26.5, p) > 0 && core.speedScore(26.5, p) < 3);
});

test('speedScore: profiles differ — advanced rides lighter wind than beginner', () => {
  assert.equal(core.speedScore(13, core.PROFILES.advanced), 5);
  assert.ok(core.speedScore(13, core.PROFILES.beginner) < 5);
  assert.equal(core.speedScore(30, core.PROFILES.intermediate), 3);
  assert.equal(core.speedScore(30, core.PROFILES.advanced), 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../wind-core.js'`

- [ ] **Step 3: Write the implementation**

`wind-core.js`:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WindCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Wind thresholds in knots per skill profile. First-guess values from the
  // spec — tune via CALIBRATION.md, keep them here and nowhere else.
  const PROFILES = {
    beginner:     { min: 12, idealLo: 15, idealHi: 20, upper: 25, cap: 28, label: 'Beginner' },
    intermediate: { min: 10, idealLo: 14, idealHi: 25, upper: 30, cap: 35, label: 'Intermediate' },
    advanced:     { min: 9,  idealLo: 12, idealHi: 30, upper: 35, cap: 40, label: 'Advanced' },
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function speedScore(kts, profile) {
    const p = profile;
    if (!Number.isFinite(kts) || kts < p.min || kts >= p.cap) return 0;
    if (kts < p.idealLo) return 2 + 3 * (kts - p.min) / (p.idealLo - p.min);
    if (kts <= p.idealHi) return 5;
    if (kts <= p.upper) return 5 - 2 * (kts - p.idealHi) / (p.upper - p.idealHi);
    return 3 - 3 * (kts - p.upper) / (p.cap - p.upper);
  }

  return { PROFILES, clamp, speedScore };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Commit**

```bash
git add wind-core.js tests/core.test.js
git commit -m "feat: wind-core speed scoring per skill profile"
```

---

### Task 3: wind-core.js — gust penalty

**Files:**
- Modify: `wind-core.js` (add `gustPenalty`, export it)
- Test: `tests/core.test.js` (append)

**Interfaces:**
- Produces: `gustPenalty(meanKts, gustKts) → number` (0–2, subtracted from score by `scoreHour` later). Penalty starts at gust factor 1.4, maxes (2.0) at factor 1.8.

- [ ] **Step 1: Write the failing tests** (append to `tests/core.test.js`)

```js
test('gustPenalty: steady wind unpunished, gusty wind punished', () => {
  assert.equal(core.gustPenalty(20, 24), 0);            // factor 1.2
  assert.equal(core.gustPenalty(20, 28), 0);            // factor 1.4 exactly
  assert.ok(Math.abs(core.gustPenalty(18, 30) - 1.333) < 0.01); // factor 1.67
  assert.equal(core.gustPenalty(15, 30), 2);            // factor 2.0, clamped
  assert.equal(core.gustPenalty(0, 10), 0);             // no mean -> no penalty
  assert.equal(core.gustPenalty(20, undefined), 0);     // missing gust data
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `core.gustPenalty is not a function`

- [ ] **Step 3: Implement** (add inside the factory in `wind-core.js`, and add `gustPenalty` to the returned object)

```js
  function gustPenalty(meanKts, gustKts) {
    if (!Number.isFinite(meanKts) || !Number.isFinite(gustKts) || meanKts <= 0) return 0;
    const factor = gustKts / meanKts;
    if (factor <= 1.4) return 0;
    return clamp(2 * (factor - 1.4) / 0.4, 0, 2);
  }
```

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add wind-core.js tests/core.test.js
git commit -m "feat: gust spread penalty"
```

---

### Task 4: wind-core.js — direction bands

**Files:**
- Modify: `wind-core.js` (add `angDiff`, `inBand`, `directionBand`; export all three)
- Test: `tests/core.test.js` (append)

**Interfaces:**
- Consumes: `spot.bands` from `spot.json` (Task 1) — `{ name, from, to, penalty, cap, offshore, note }`, `from`/`to` in compass degrees, wraparound allowed (`from > to`).
- Produces:
  - `angDiff(a, b) → number` — smallest absolute angle between two bearings (0–180)
  - `inBand(deg, band) → boolean` — wraparound-aware
  - `directionBand(deg, bands) → band | null`

- [ ] **Step 1: Write the failing tests** (append to `tests/core.test.js`; note the fs/path requires already exist in `tests/spot.test.js` — add them here too)

```js
const fs = require('node:fs');
const path = require('node:path');
const spot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spot.json'), 'utf8'));

test('angDiff: shortest way round the compass', () => {
  assert.equal(core.angDiff(10, 350), 20);
  assert.equal(core.angDiff(45, 250), 155);
  assert.equal(core.angDiff(70, 70), 0);
});

test('directionBand: maps Gurnard degrees to the right band', () => {
  assert.equal(core.directionBand(230, spot.bands).name, 'Cross-shore SW');
  assert.equal(core.directionBand(300, spot.bands).name, 'Cross-on W–NW');
  assert.equal(core.directionBand(10, spot.bands).name, 'Onshore N–NE'); // wraparound band 330-50
  assert.equal(core.directionBand(345, spot.bands).name, 'Onshore N–NE');
  assert.equal(core.directionBand(90, spot.bands).name, 'Cross-off E–SE');
  assert.equal(core.directionBand(170, spot.bands).name, 'Offshore S–SSW');
  assert.equal(core.directionBand(170, spot.bands).cap, 2);
  assert.equal(core.directionBand(170, spot.bands).offshore, true);
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL — `core.angDiff is not a function`

- [ ] **Step 3: Implement** (add inside factory, export `angDiff`, `inBand`, `directionBand`)

```js
  function angDiff(a, b) {
    const d = Math.abs((((a - b) % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
  }

  function inBand(deg, band) {
    const d = ((deg % 360) + 360) % 360;
    return band.from <= band.to
      ? d >= band.from && d < band.to
      : d >= band.from || d < band.to;
  }

  function directionBand(deg, bands) {
    if (!Number.isFinite(deg) || !Array.isArray(bands)) return null;
    return bands.find((b) => inBand(deg, b)) || null;
  }
```

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add wind-core.js tests/core.test.js
git commit -m "feat: direction bands with wraparound"
```

---

### Task 5: wind-core.js — tide context from Admiralty events

**Files:**
- Modify: `wind-core.js` (add `parseEventMs`, `tideContext`; export both)
- Test: `tests/core.test.js` (append)

**Interfaces:**
- Consumes: raw Admiralty TidalEvents array as returned by the existing tide-proxy: `[{ EventType: 'HighWater'|'LowWater', DateTime: '2026-07-20T03:12:00', Height: 4.1 }, ...]`. Timestamps WITHOUT a zone suffix are UTC (Admiralty quirk — same handling as `swim-core.js`).
- Produces: `tideContext(events, when) → { state: 'ebb'|'flood', height, range, springsCoeff, hoursToNext, nextKind } | null` (null when `when` falls outside the event window — callers must handle it).

- [ ] **Step 1: Write the failing tests** (append)

```js
test('parseEventMs: Admiralty timestamps without zone are UTC', () => {
  assert.equal(core.parseEventMs('2026-07-20T06:40:00'), Date.UTC(2026, 6, 20, 6, 40, 0));
  assert.equal(core.parseEventMs('2026-07-20T06:40:00Z'), Date.UTC(2026, 6, 20, 6, 40, 0));
});

test('tideContext: ebb between HW and LW, springs coefficient from range', () => {
  const events = [
    { EventType: 'HighWater', DateTime: '2026-07-20T00:00:00', Height: 4.2 },
    { EventType: 'LowWater', DateTime: '2026-07-20T06:00:00', Height: 0.6 },
    { EventType: 'HighWater', DateTime: '2026-07-20T12:20:00', Height: 4.1 },
  ];
  const ctx = core.tideContext(events, new Date('2026-07-20T03:00:00Z'));
  assert.equal(ctx.state, 'ebb');
  assert.equal(ctx.nextKind, 'low');
  assert.ok(Math.abs(ctx.range - 3.6) < 0.01);
  assert.equal(ctx.springsCoeff, 1); // 3.6m range = full springs
  assert.ok(ctx.height > 0.6 && ctx.height < 4.2);
  assert.ok(Math.abs(ctx.hoursToNext - 3) < 0.01);

  const flood = core.tideContext(events, new Date('2026-07-20T09:00:00Z'));
  assert.equal(flood.state, 'flood');
});

test('tideContext: neap range gives low springs coefficient, outside window gives null', () => {
  const events = [
    { EventType: 'HighWater', DateTime: '2026-07-20T00:00:00', Height: 3.1 },
    { EventType: 'LowWater', DateTime: '2026-07-20T06:00:00', Height: 1.3 }, // range 1.8
  ];
  assert.equal(core.tideContext(events, new Date('2026-07-20T03:00:00Z')).springsCoeff, 0);
  assert.equal(core.tideContext(events, new Date('2026-07-21T03:00:00Z')), null);
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL — `core.parseEventMs is not a function`

- [ ] **Step 3: Implement** (add inside factory; export `parseEventMs`, `tideContext`)

```js
  function parseEventMs(dateTime) {
    if (!dateTime) return NaN;
    return /[Zz]$|[+-]\d{2}:\d{2}$/.test(dateTime)
      ? new Date(dateTime).getTime()
      : new Date(dateTime + 'Z').getTime();
  }

  // Cowes tidal range runs ~1.8m (dead neaps) to ~3.6m (big springs).
  const NEAP_RANGE = 1.8;
  const SPRING_RANGE = 3.6;

  function tideContext(events, when) {
    if (!Array.isArray(events)) return null;
    const ms = when.getTime();
    const parsed = events
      .map((e) => ({
        kind: /low/i.test(String(e.EventType)) ? 'low' : 'high',
        ms: parseEventMs(e.DateTime),
        height: Number(e.Height),
      }))
      .filter((e) => Number.isFinite(e.ms) && Number.isFinite(e.height))
      .sort((a, b) => a.ms - b.ms);

    let prev = null;
    let next = null;
    for (const e of parsed) {
      if (e.ms <= ms) prev = e;
      else { next = e; break; }
    }
    if (!prev || !next) return null;

    const frac = (ms - prev.ms) / (next.ms - prev.ms);
    // Sinusoidal interpolation — tides are not linear between events.
    const height = prev.height + (next.height - prev.height) * (1 - Math.cos(Math.PI * frac)) / 2;
    const range = Math.abs(next.height - prev.height);
    return {
      state: next.kind === 'high' ? 'flood' : 'ebb',
      height,
      range,
      springsCoeff: clamp((range - NEAP_RANGE) / (SPRING_RANGE - NEAP_RANGE), 0, 1),
      hoursToNext: (next.ms - ms) / 3600000,
      nextKind: next.kind,
    };
  }
```

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add wind-core.js tests/core.test.js
git commit -m "feat: tide context from Admiralty events"
```

---

### Task 6: wind-core.js — wind-against-tide chop penalty

**Files:**
- Modify: `wind-core.js` (add `chopPenalty`; export it)
- Test: `tests/core.test.js` (append)

**Interfaces:**
- Consumes: `tideContext` result (Task 5), `spot.floodSetsDeg` (70) / `spot.ebbSetsDeg` (250) from Task 1.
- Produces: `chopPenalty(windFromDeg, windKts, tide, spot) → number` (0 when wind and stream agree; up to 1.0 on big springs in strong wind). Wind is "against" the tide when the direction the wind blows TOWARD (`windFromDeg + 180`) is more than 120° away from the stream's set direction.

- [ ] **Step 1: Write the failing tests** (append)

```js
const gurnardSpot = { floodSetsDeg: 70, ebbSetsDeg: 250 };

test('chopPenalty: SW wind is clean on the flood, choppy on the ebb', () => {
  const springs = { state: 'flood', springsCoeff: 1 };
  // SW wind (from 225) blows toward 45; flood sets 70 -> agree -> no chop
  assert.equal(core.chopPenalty(225, 18, springs, gurnardSpot), 0);
  // Same wind on the ebb (sets 250) -> opposed -> chop
  const ebbSprings = { state: 'ebb', springsCoeff: 1 };
  const p = core.chopPenalty(225, 18, ebbSprings, gurnardSpot);
  assert.ok(p > 0.5, `expected chop penalty, got ${p}`);
});

test('chopPenalty: scales with springs coefficient and wind, zero without tide data', () => {
  const ebbNeaps = { state: 'ebb', springsCoeff: 0 };
  const ebbSprings = { state: 'ebb', springsCoeff: 1 };
  assert.ok(core.chopPenalty(225, 20, ebbNeaps, gurnardSpot) < core.chopPenalty(225, 20, ebbSprings, gurnardSpot));
  assert.ok(core.chopPenalty(225, 10, ebbSprings, gurnardSpot) < core.chopPenalty(225, 20, ebbSprings, gurnardSpot));
  assert.equal(core.chopPenalty(225, 20, null, gurnardSpot), 0);
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL — `core.chopPenalty is not a function`

- [ ] **Step 3: Implement** (add inside factory; export `chopPenalty`)

```js
  function chopPenalty(windFromDeg, windKts, tide, spot) {
    if (!tide || !Number.isFinite(windFromDeg)) return 0;
    const set = tide.state === 'flood' ? spot.floodSetsDeg : spot.ebbSetsDeg;
    const windToward = (windFromDeg + 180) % 360;
    if (angDiff(windToward, set) <= 120) return 0;
    return (0.4 + 0.6 * tide.springsCoeff) * clamp(windKts / 20, 0, 1);
  }
```

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add wind-core.js tests/core.test.js
git commit -m "feat: wind-against-tide chop penalty"
```

---

### Task 7: wind-core.js — scoreHour (the whole brain, combined)

**Files:**
- Modify: `wind-core.js` (add `scoreHour`; export it)
- Test: `tests/core.test.js` (append)

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces: `scoreHour(hour, tide, profileKey, spot) → { score, reasons, flags }` where:
  - `hour = { meanKts, gustKts, dirDeg, daylight }` (`daylight` boolean, computed by app.js from Open-Meteo sunrise/sunset)
  - `tide` = `tideContext` result or `null` (degraded mode: score on wind alone)
  - `profileKey` = `'beginner' | 'intermediate' | 'advanced'` (unknown keys fall back to intermediate)
  - returns `score` 0–5 (one decimal place is fine — UI rounds), `reasons: string[]`, `flags: { offshore, chop, eddy, ledge }`
- This is the function `app.js` calls per forecast hour. Signature must match exactly.

- [ ] **Step 1: Write the failing tests** (append)

```js
const fullSpot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spot.json'), 'utf8'));

test('scoreHour: steady SW on the flood in daylight is a green window', () => {
  const r = core.scoreHour(
    { meanKts: 18, gustKts: 22, dirDeg: 230, daylight: true },
    { state: 'flood', height: 2.8, range: 3.0, springsCoeff: 0.66, hoursToNext: 2, nextKind: 'high' },
    'intermediate', fullSpot
  );
  assert.ok(r.score >= 4, `expected >= 4, got ${r.score}`);
  assert.equal(r.flags.offshore, false);
  assert.equal(r.flags.chop, false);
});

test('scoreHour: offshore wind can never score above its cap, however perfect', () => {
  const r = core.scoreHour(
    { meanKts: 18, gustKts: 20, dirDeg: 170, daylight: true },
    null, 'advanced', fullSpot
  );
  assert.ok(r.score <= 2, `offshore must cap at 2, got ${r.score}`);
  assert.equal(r.flags.offshore, true);
  assert.ok(r.reasons.some((s) => /offshore/i.test(s)));
});

test('scoreHour: gusty SE morning is capped with warnings', () => {
  const r = core.scoreHour(
    { meanKts: 25, gustKts: 38, dirDeg: 120, daylight: true },
    null, 'intermediate', fullSpot
  );
  assert.ok(r.score <= 3);
  assert.equal(r.flags.offshore, true);
  assert.ok(r.reasons.some((s) => /gust/i.test(s)));
});

test('scoreHour: dark means zero; ebb sets eddy flag; low springs sets ledge flag', () => {
  const dark = core.scoreHour({ meanKts: 18, gustKts: 20, dirDeg: 230, daylight: false }, null, 'intermediate', fullSpot);
  assert.equal(dark.score, 0);
  assert.ok(dark.reasons.some((s) => /dark/i.test(s)));

  const ebbLow = core.scoreHour(
    { meanKts: 16, gustKts: 19, dirDeg: 230, daylight: true },
    { state: 'ebb', height: 0.9, range: 3.4, springsCoeff: 0.9, hoursToNext: 1, nextKind: 'low' },
    'intermediate', fullSpot
  );
  assert.equal(ebbLow.flags.eddy, true);
  assert.equal(ebbLow.flags.ledge, true);
  assert.ok(ebbLow.reasons.some((s) => /eddy/i.test(s)));
  assert.ok(ebbLow.reasons.some((s) => /[Ll]edge/.test(s)));
});

test('scoreHour: too-light wind reports why', () => {
  const r = core.scoreHour({ meanKts: 6, gustKts: 8, dirDeg: 230, daylight: true }, null, 'beginner', fullSpot);
  assert.equal(r.score, 0);
  assert.ok(r.reasons.some((s) => /light/i.test(s)));
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL — `core.scoreHour is not a function`

- [ ] **Step 3: Implement** (add inside factory; export `scoreHour`)

```js
  // Below this height on a big spring ebb, Gurnard Ledge is a foil-eater.
  const LEDGE_HEIGHT_M = 1.2;
  const LEDGE_SPRINGS_COEFF = 0.6;

  function scoreHour(hour, tide, profileKey, spot) {
    const profile = PROFILES[profileKey] || PROFILES.intermediate;
    const reasons = [];
    const flags = { offshore: false, chop: false, eddy: false, ledge: false };

    let score = speedScore(hour.meanKts, profile);
    if (score === 0 && Number.isFinite(hour.meanKts)) {
      reasons.push(hour.meanKts < profile.min
        ? `Too light for ${profile.label.toLowerCase()} (${Math.round(hour.meanKts)} kts)`
        : `Too strong for ${profile.label.toLowerCase()} (${Math.round(hour.meanKts)} kts)`);
    }

    const gp = gustPenalty(hour.meanKts, hour.gustKts);
    if (gp > 0.3) reasons.push(`Gusty — ${Math.round(hour.meanKts)} kts gusting ${Math.round(hour.gustKts)}`);
    score -= gp;

    const band = directionBand(hour.dirDeg, spot.bands);
    if (band) {
      score -= band.penalty || 0;
      if (band.offshore) flags.offshore = true;
      if (band.note) reasons.push(band.note);
      score = Math.min(score, band.cap);
    }

    const cp = chopPenalty(hour.dirDeg, hour.meanKts, tide, spot);
    if (cp > 0.2) {
      flags.chop = true;
      reasons.push('Wind against tide — expect chop');
    }
    score -= cp;

    if (tide && tide.state === 'ebb') {
      flags.eddy = true;
      reasons.push('Ebb eddy in the bay — flatter water inshore');
    }
    if (tide && tide.height < LEDGE_HEIGHT_M && tide.springsCoeff > LEDGE_SPRINGS_COEFF) {
      flags.ledge = true;
      reasons.push('Gurnard Ledge shallow — watch your foil west of the bay');
    }

    if (!hour.daylight) {
      score = 0;
      reasons.push('After dark');
    }

    return { score: clamp(score, 0, 5), reasons, flags };
  }
```

- [ ] **Step 4: Run all tests** — Run: `npm test` — Expected: PASS (every test file)

- [ ] **Step 5: Commit**

```bash
git add wind-core.js tests/core.test.js
git commit -m "feat: scoreHour combining wind, direction, tide and daylight"
```

---

### Task 8: bramble-proxy edge function

**Files:**
- Create: `supabase/config.toml`, `supabase/functions/bramble-proxy/index.ts`, `supabase/functions/bramble-proxy/deno.json`

**Interfaces:**
- Produces: `GET https://gsucaxeqzluzbmvonsmj.supabase.co/functions/v1/bramble-proxy` → `{ windKts, gustKts, dirDeg, at }` (all numbers, `at` ISO string) or HTTP 502 `{ error }`. Consumed by `app.js` (Task 10) — this exact shape.

- [ ] **Step 1: Verify the Bramblemet feed format (do this FIRST — the parser depends on it)**

Run: `curl -s https://www.bramblemet.co.uk/bra.csv | tail -5`
Expected: CSV rows with a header naming wind columns (historically `WSPD` mean kts, `GST` gust kts, `WD` direction deg). If this URL 404s, check `https://www.bramblemet.co.uk/` for the current data feed link (SotonMet-family sites also serve `.csv` feeds) and substitute the working URL in Step 2. The parser below reads column positions from the header row by name, so column ORDER doesn't matter — but record the actual header names and adjust the three name-lists in the code if they differ.

- [ ] **Step 2: Write the function**

`supabase/functions/bramble-proxy/deno.json`:

```json
{ "lock": false }
```

`supabase/config.toml` (project link file, same as siblings):

```toml
project_id = "gurnard-wing-check"
```

`supabase/functions/bramble-proxy/index.ts`:

```ts
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
```

- [ ] **Step 3: Deploy and verify**

Run: `supabase functions deploy bramble-proxy --project-ref gsucaxeqzluzbmvonsmj --no-verify-jwt`
Then: `curl -s https://gsucaxeqzluzbmvonsmj.supabase.co/functions/v1/bramble-proxy`
Expected: `{"windKts":<n>,"gustKts":<n>,"dirDeg":<n>,"at":"..."}` with plausible numbers (compare against bramblemet.co.uk in a browser). If deploy asks for login, run `supabase login` first (Hamish may need to authorise).

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: bramble-proxy edge function for live Solent wind"
```

---

### Task 9: Static shell — index.html, styles, manifest, icons, feedback

**Files:**
- Create: `index.html`, `styles.css`, `manifest.json`, `icon.svg`, `icon.png`, `icon-192.png`, `feedback.html`, `tools/render-icons.js`

**Interfaces:**
- Produces: DOM ids consumed by `app.js` (Task 10) — these exact ids: `dataStatus`, `verdictCard`, `verdictScore`, `verdictText`, `liveCard`, `liveText`, `skillToggle` (container with three buttons carrying `data-profile` attributes), `daysStrip`, `reasonsModal`, `reasonsList`, `reasonsTitle`, `reasonsClose`.

- [ ] **Step 1: Copy the sibling stylesheet as a base, then append app-specific styles**

```bash
cp ../iow-sea-swim/styles.css styles.css
cp ../iow-sea-swim/feedback.html feedback.html
```

Edit `feedback.html`: change every visible occurrence of the sea-swim app name to "Gurnard Wing Check" (title tag, heading, any mailto subject). Keep structure identical.

Append to `styles.css`:

```css
/* --- Gurnard Wing Check additions --- */
.skill-toggle { display: flex; gap: 6px; margin: 10px 0 14px; }
.skill-toggle button {
  flex: 1; padding: 10px 4px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.25);
  background: transparent; color: inherit; font-size: 0.95rem; cursor: pointer;
}
.skill-toggle button.active { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 600; }

.day-block { margin-bottom: 14px; }
.day-label { font-size: 0.85rem; opacity: 0.8; margin-bottom: 4px; }
.hour-row { display: flex; gap: 2px; }
.hour-cell {
  flex: 1; height: 34px; border-radius: 4px; border: 0; cursor: pointer;
  font-size: 0.6rem; color: rgba(255,255,255,0.85); padding: 0;
}
.hour-cell.score-red { background: #8b2f2f; }
.hour-cell.score-amber { background: #b07d2a; }
.hour-cell.score-green { background: #2e8b57; }
.hour-cell.score-dark { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.3); cursor: default; }

.verdict-score { font-size: 2.4rem; font-weight: 700; }
.live-drift { color: #ffb454; font-weight: 600; }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: none; align-items: center; justify-content: center; z-index: 50;
}
.modal-backdrop.open { display: flex; }
.modal {
  background: #0d2233; border-radius: 14px; padding: 18px; max-width: 420px; width: 90%;
}
.modal ul { margin: 10px 0 14px 18px; }
.modal button { padding: 8px 16px; border-radius: 8px; border: 0; background: #1f6feb; color: #fff; cursor: pointer; }

.safety-note { font-size: 0.8rem; opacity: 0.75; margin: 18px 0; line-height: 1.4; }
```

- [ ] **Step 2: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="icon.svg">
<link rel="apple-touch-icon" href="icon.png">
<meta property="og:title" content="Gurnard Wing Check">
<meta property="og:description" content="Should you go out? Wing foiling windows for Gurnard, Isle of Wight">
<meta property="og:type" content="website">
<meta name="theme-color" content="#08273a">
<link rel="manifest" href="manifest.json">
<title>Gurnard Wing Check</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>

<header>
  <img class="app-mark" src="icon-192.png" alt="" aria-hidden="true">
  <h1>Gurnard Wing Check</h1>
  <div class="subtitle">Should you go out? Wing windows for Gurnard, IoW</div>
</header>

<div class="container">
  <div class="data-status" id="dataStatus">Loading forecast...</div>

  <div class="skill-toggle" id="skillToggle" role="group" aria-label="Skill level">
    <button data-profile="beginner">Beginner</button>
    <button data-profile="intermediate" class="active">Intermediate</button>
    <button data-profile="advanced">Advanced</button>
  </div>

  <div class="card" id="verdictCard">
    <h3>Right now</h3>
    <div class="verdict-score" id="verdictScore">–</div>
    <div id="verdictText">Waiting for data…</div>
  </div>

  <div class="card" id="liveCard" hidden>
    <h3>Live at Bramble Bank</h3>
    <div id="liveText"></div>
  </div>

  <div class="card">
    <h3>Next 7 days</h3>
    <p class="day-label">Daylight hours only. Tap an hour for the why.</p>
    <div id="daysStrip"></div>
  </div>

  <p class="safety-note">This is a planning aid, not a safety forecast. Check conditions
  with your own eyes, tell someone you're going out, and never ride offshore winds alone.
  Tide data: UK Hydrographic Office (Cowes). Wind forecast: Open-Meteo. Live wind: Bramblemet.</p>

  <p class="safety-note"><a href="feedback.html">Feedback</a></p>
</div>

<div class="modal-backdrop" id="reasonsModal">
  <div class="modal">
    <h3 id="reasonsTitle"></h3>
    <ul id="reasonsList"></ul>
    <button id="reasonsClose">Close</button>
  </div>
</div>

<script src="wind-core.js"></script>
<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Manifest and icons**

`manifest.json`:

```json
{
  "name": "Gurnard Wing Check",
  "short_name": "Wing Check",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#08273a",
  "theme_color": "#08273a",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`icon.svg` (simple wing over water):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="#08273a"/>
  <path d="M15 62 Q40 18 85 30 Q60 42 48 62 Z" fill="#4db8ff"/>
  <path d="M48 62 L52 34" stroke="#e6f4ff" stroke-width="3" stroke-linecap="round"/>
  <path d="M10 78 Q25 72 40 78 T70 78 T95 78" stroke="#2e8b57" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>
```

`tools/render-icons.js` (renders the PNGs with the Playwright Chrome already installed):

```js
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

(async () => {
  const svg = fs.readFileSync('icon.svg', 'utf8');
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const { size, out } of [{ size: 512, out: 'icon.png' }, { size: 192, out: 'icon-192.png' }]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent('<style>body{margin:0}svg{display:block}</style>' +
      svg.replace('<svg ', `<svg width="${size}" height="${size}" `));
    await page.screenshot({ path: out });
    await page.close();
  }
  await browser.close();
})();
```

Run: `node tools/render-icons.js`
Expected: `icon.png` (512×512) and `icon-192.png` created. Open them to eyeball.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css manifest.json icon.svg icon.png icon-192.png feedback.html tools/
git commit -m "feat: static shell, styles, manifest and icons"
```

---

### Task 10: app.js — fetch, score, render

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `WindCore` global (Tasks 2–7 — `PROFILES`, `tideContext`, `scoreHour`), `spot.json` (Task 1), DOM ids from Task 9, tide-proxy (`?days=7&station=0060` → raw Admiralty array), bramble-proxy (`{ windKts, gustKts, dirDeg, at }`), Open-Meteo.
- Produces: the running app. Degraded modes per spec: no tide → wind-only scores + status note; no Bramble → live card hidden; no forecast → error status, nothing rendered.

- [ ] **Step 1: Write app.js**

```js
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
    hours.push({
      time,
      iso: h.time[i],
      day,
      hour,
      tide,
      result: WindCore.scoreHour(hour, tide, profileKey, spot),
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
```

- [ ] **Step 2: Syntax check and full test run**

Run: `npm run check && npm test`
Expected: both PASS.

- [ ] **Step 3: Eyeball it in a browser**

Run: `python3 -m http.server 8765` (from the repo root), open `http://localhost:8765`.
Expected: status line settles, verdict card shows a score, 7 day-blocks of coloured hour cells render, tapping a cell opens the reasons modal, skill toggle changes cell colours, live card appears (or stays hidden if bramble-proxy isn't deployed yet). Stop the server after.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: app fetch, scoring and render pipeline"
```

---

### Task 11: Playwright e2e with mocked APIs

**Files:**
- Create: `tests/e2e/wing-check.spec.js`

**Interfaces:**
- Consumes: the running static site; mocks all three network sources so the test is deterministic and offline-safe.

- [ ] **Step 1: Write the e2e test**

`tests/e2e/wing-check.spec.js`:

```js
const { test, expect } = require('@playwright/test');
const path = require('path');

const APP_URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');

function openMeteoFixture() {
  const time = [];
  const wind = [];
  const gusts = [];
  const dir = [];
  const today = new Date();
  today.setMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++) {
    const t = new Date(today.getTime() + i * 3600 * 1000);
    time.push(t.toISOString().slice(0, 16));
    wind.push(18);
    gusts.push(21);
    dir.push(230); // steady cross-shore SW
  }
  const day0 = time[0].slice(0, 10);
  const day1 = time[24].slice(0, 10);
  return {
    hourly: { time, wind_speed_10m: wind, wind_gusts_10m: gusts, wind_direction_10m: dir },
    daily: {
      time: [day0, day1],
      sunrise: [day0 + 'T05:00', day1 + 'T05:00'],
      sunset: [day0 + 'T21:00', day1 + 'T21:00'],
    },
  };
}

function tideFixture() {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
  return [
    { EventType: 'HighWater', DateTime: iso(now - 2 * 3600 * 1000), Height: 4.0 },
    { EventType: 'LowWater', DateTime: iso(now + 4 * 3600 * 1000), Height: 0.8 },
    { EventType: 'HighWater', DateTime: iso(now + 10 * 3600 * 1000), Height: 4.1 },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ json: openMeteoFixture() }));
  await page.route('**/functions/v1/tide-proxy*', (route) =>
    route.fulfill({ json: tideFixture() }));
  await page.route('**/functions/v1/bramble-proxy*', (route) =>
    route.fulfill({ json: { windKts: 17, gustKts: 20, dirDeg: 235, at: new Date().toISOString() } }));
});

test('renders verdict, strip, live card and reasons modal', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('#verdictScore')).not.toHaveText('–');
  await expect(page.locator('#liveCard')).toBeVisible();
  await expect(page.locator('.hour-cell').first()).toBeVisible();

  await page.locator('.hour-cell.score-green').first().click();
  await expect(page.locator('#reasonsModal')).toHaveClass(/open/);
  await page.locator('#reasonsClose').click();
  await expect(page.locator('#reasonsModal')).not.toHaveClass(/open/);
});

test('skill toggle persists and rescores', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('#verdictScore')).not.toHaveText('–');
  await page.locator('button[data-profile="beginner"]').click();
  await expect(page.locator('button[data-profile="beginner"]')).toHaveClass(/active/);
  const stored = await page.evaluate(() => localStorage.getItem('wing_profile'));
  expect(stored).toBe('beginner');
});

test('degraded mode: tide failure falls back to wind-only scoring', async ({ page }) => {
  await page.unroute('**/functions/v1/tide-proxy*');
  await page.route('**/functions/v1/tide-proxy*', (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.addInitScript(() => localStorage.removeItem('wing_tide_cache_v1'));
  await page.goto(APP_URL);
  await expect(page.locator('#dataStatus')).toContainText('wind alone');
  await expect(page.locator('#verdictScore')).not.toHaveText('–');
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e`
Expected: 3 passed. (If `spot.json` fetch fails under `file://` in Chrome, serve instead: change `APP_URL` to use a `python3 -m http.server` started by the test — but siblings run fine from Playwright's Chrome; try `file://` first.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/wing-check.spec.js
git commit -m "test: e2e coverage with mocked wind, tide and live APIs"
```

---

### Task 12: README, CALIBRATION.md, GitHub repo, deploy

**Files:**
- Create: `README.md`, `CALIBRATION.md`

- [ ] **Step 1: Write README.md**

```markdown
# Gurnard Wing Check

Should you go out? Hourly wing-foiling windows (0–5) for Gurnard, Isle of Wight,
scored from Open-Meteo wind, Admiralty tide (Cowes 0060, via Supabase tide-proxy),
Bramblemet live wind, and hard-coded local knowledge: the Gurnard Bay ebb eddy,
Gurnard Ledge, wind-against-tide chop, and offshore safety caps.

Skill toggle (Beginner / Intermediate / Advanced) shifts wind thresholds; saved in
localStorage. No accounts.

This is a planning aid, not a safety forecast. Offshore winds are never shown green.

- Spec: docs/superpowers/specs/2026-07-20-gurnard-wing-check-design.md
- Tuning log: CALIBRATION.md
- Tests: `npm test` (core), `npm run test:e2e` (Playwright)
- Siblings: gurnard-beach-walk, iow-sea-swim (same stack and conventions)
```

- [ ] **Step 2: Write CALIBRATION.md**

```markdown
# Gurnard Wing Check — Calibration Log

Log real sessions here; tune spot.json bands and WindCore.PROFILES against them.
Direction bands and tide-stream bearings (floodSetsDeg 70 / ebbSetsDeg 250) are
FIRST GUESSES — Hamish to verify bands on the beach with a phone compass.

## Real-World Sessions

| Date | Time | Profile | App score | Actual (0-5) | Notes (wind felt, chop, tide state) |
|------|------|---------|-----------|--------------|-------------------------------------|
|      |      |         |           |              |                                     |

## Values Under Review

- Wind thresholds per profile (wind-core.js PROFILES)
- Direction band edges + penalties/caps (spot.json)
- Chop: opposition angle 120°, penalty 0.4–1.0 (wind-core.js chopPenalty)
- Springs range normalisation: 1.8m neaps → 3.6m springs (wind-core.js)
- Ledge warning: height < 1.2m and springsCoeff > 0.6
```

- [ ] **Step 3: Final full check and commit**

Run: `npm run check && npm test && npm run test:e2e`
Expected: everything PASS.

```bash
git add README.md CALIBRATION.md
git commit -m "docs: README and calibration log"
```

- [ ] **Step 4: Create the GitHub repo and push**

```bash
gh repo create winehusband/gurnard-wing-check --public --source . --push
```

Expected: repo created, `main` pushed.

- [ ] **Step 5: Deploy to Cloudflare Pages (Hamish action likely needed)**

Sibling `iow-sea-swim` is on Cloudflare Pages (`iow-sea-swim.pages.dev`). Either:
- Dashboard: Cloudflare Pages → Create project → connect `winehusband/gurnard-wing-check`, no build step, output dir `/`. **This needs Hamish's Cloudflare login — ask, don't guess.**
- Or CLI if already authenticated: `npx wrangler pages project create gurnard-wing-check && npx wrangler pages deploy . --project-name=gurnard-wing-check`

Expected result: app live at `gurnard-wing-check.pages.dev`. Update `og:image` in `index.html` with the live URL + `/icon.png` afterwards and commit.

---

## Self-Review Notes

- Spec coverage: data sources (T8, T10), scoring model incl. all five rules (T2–T7), skill toggle + localStorage (T9/T10), live layer + drift flag (T10), 7-day strip + reasons + verdict (T10), degraded modes (T10 + e2e T11), safety framing (T9 copy + offshore cap tests T7), calibration (T12), testing (T2–T7, T11). Out-of-scope items correctly absent.
- Offshore safety cap has a dedicated unit test (T7) — the non-negotiable constraint is enforced by CI, not convention.
- Type consistency: `scoreHour(hour, tide, profileKey, spot)` signature identical in T7 (definition), T10 (call), T11 (behavioural assertions). Bramble-proxy shape `{ windKts, gustKts, dirDeg, at }` identical in T8 and T10.
