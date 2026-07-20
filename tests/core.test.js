const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../wind-core.js');
const spot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spot.json'), 'utf8'));

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

test('gustPenalty: steady wind unpunished, gusty wind punished', () => {
  assert.equal(core.gustPenalty(20, 24), 0);            // factor 1.2
  assert.equal(core.gustPenalty(20, 28), 0);            // factor 1.4 exactly
  assert.ok(Math.abs(core.gustPenalty(18, 30) - 1.333) < 0.01); // factor 1.67
  assert.equal(core.gustPenalty(15, 30), 2);            // factor 2.0, clamped
  assert.equal(core.gustPenalty(0, 10), 0);             // no mean -> no penalty
  assert.equal(core.gustPenalty(20, undefined), 0);     // missing gust data
});

test('angDiff: shortest way round the compass', () => {
  assert.equal(core.angDiff(10, 350), 20);
  assert.equal(core.angDiff(45, 250), 155);
  assert.equal(core.angDiff(70, 70), 0);
});

test('directionBand: maps Gurnard degrees to the right band', () => {
  assert.equal(core.directionBand(230, spot.bands).name, 'Prime SSW–WNW');
  assert.equal(core.directionBand(300, spot.bands).name, 'Cross-on WNW–NNW');
  assert.equal(core.directionBand(10, spot.bands).name, 'Onshore N–NE'); // wraparound band 330-50
  assert.equal(core.directionBand(345, spot.bands).name, 'Onshore N–NE');
  assert.equal(core.directionBand(90, spot.bands).name, 'Cross-off E–SE');
  assert.equal(core.directionBand(170, spot.bands).name, 'Offshore S');
  assert.equal(core.directionBand(170, spot.bands).cap, 2);
  assert.equal(core.directionBand(170, spot.bands).offshore, true);
});

test('directionBand: SSW prime band widened per Humphrey calibration', () => {
  assert.equal(core.directionBand(205, spot.bands).name, 'Prime SSW–WNW');
  assert.equal(core.directionBand(195, spot.bands).cap, 2); // just below the widened prime band -> still offshore
  assert.equal(core.directionBand(230, spot.bands).name, 'Prime SSW–WNW');
});

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

test('tideContext: stream turns before the height curve (Humphrey — Solent streams lead HW by ~1.25h)', () => {
  const events = [
    { EventType: 'LowWater', DateTime: '2026-07-20T06:00:00', Height: 0.9 },
    { EventType: 'HighWater', DateTime: '2026-07-20T12:00:00', Height: 4.0 },
    { EventType: 'LowWater', DateTime: '2026-07-20T18:00:00', Height: 0.8 },
    { EventType: 'HighWater', DateTime: '2026-07-20T24:20:00', Height: 4.1 },
  ];
  const when = new Date('2026-07-20T11:00:00Z');
  const noLead = core.tideContext(events, when, 0);
  const withLead = core.tideContext(events, when, 1.25);
  assert.equal(noLead.state, 'flood'); // height curve still rising toward HW 12:00
  assert.equal(withLead.state, 'ebb'); // stream has already turned, 1.25h ahead of HW
  assert.equal(noLead.height, withLead.height); // height unaffected by the lead
});

const gurnardSpot = { floodSetsDeg: 70, ebbSetsDeg: 250 };
const fullSpot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spot.json'), 'utf8'));

test('windAgainstTide: SW wind (225) agrees with the flood, opposes the ebb', () => {
  const flood = { state: 'flood', springsCoeff: 1 };
  assert.equal(core.windAgainstTide(225, flood, gurnardSpot), false);
  const ebb = { state: 'ebb', springsCoeff: 1 };
  assert.equal(core.windAgainstTide(225, ebb, gurnardSpot), true);
  assert.equal(core.windAgainstTide(225, null, gurnardSpot), false);
});

test('tideBonus: 0 with the flood for SW, maxes at 1.0 on ebb springs at 18kts, scales down at neaps/light wind', () => {
  const flood = { state: 'flood', springsCoeff: 1 };
  assert.equal(core.tideBonus(225, 18, flood, gurnardSpot), 0);

  const ebbSprings = { state: 'ebb', springsCoeff: 1 };
  assert.equal(core.tideBonus(225, 18, ebbSprings, gurnardSpot), 1.0);

  const ebbNeaps = { state: 'ebb', springsCoeff: 0 };
  assert.ok(core.tideBonus(225, 18, ebbNeaps, gurnardSpot) < core.tideBonus(225, 18, ebbSprings, gurnardSpot));

  const ebbSpringsLight = { state: 'ebb', springsCoeff: 1 };
  assert.ok(core.tideBonus(225, 8, ebbSpringsLight, gurnardSpot) < core.tideBonus(225, 18, ebbSprings, gurnardSpot));

  assert.equal(core.tideBonus(225, 18, null, gurnardSpot), 0);
});

test('scoreHour: steady SW on the flood in daylight is a green window', () => {
  const r = core.scoreHour(
    { meanKts: 18, gustKts: 22, dirDeg: 230, daylight: true },
    { state: 'flood', height: 2.8, range: 3.0, springsCoeff: 0.66, hoursToNext: 2, nextKind: 'high' },
    'intermediate', fullSpot
  );
  assert.ok(r.score >= 4, `expected >= 4, got ${r.score}`);
  assert.equal(r.flags.offshore, false);
  assert.equal(r.flags.windAgainstTide, false);
});

test('scoreHour: SW 18kts on ebb springs in daylight — prime band, bonus capped by the band cap', () => {
  const r = core.scoreHour(
    { meanKts: 18, gustKts: 18, dirDeg: 225, daylight: true },
    { state: 'ebb', height: 2.5, range: 3.6, springsCoeff: 1, hoursToNext: 2, nextKind: 'low' },
    'intermediate', fullSpot
  );
  assert.equal(r.score, 5); // base 5 (prime band, cap 5) + bonus, re-capped at 5
  assert.equal(r.flags.windAgainstTide, true);
});

test('SAFETY: tideBonus can never push a score past its offshore band cap — Offshore S (170°)', () => {
  const r = core.scoreHour(
    { meanKts: 18, gustKts: 18, dirDeg: 170, daylight: true },
    { state: 'ebb', height: 2.5, range: 3.6, springsCoeff: 1, hoursToNext: 2, nextKind: 'low' },
    'advanced', fullSpot
  );
  assert.ok(r.score <= 2, `offshore must cap at 2 even with max bonus conditions, got ${r.score}`);
  assert.equal(r.flags.offshore, true);
});

test('SAFETY: tideBonus can never push a score past its offshore band cap — Cross-off E-SE (90°, active bonus)', () => {
  // 90° opposes the FLOOD stream (set 70°) at Gurnard's actual set angles — this is
  // the real-world case where a wind-against-tide bonus applies inside an offshore
  // band, so it is the one that actually exercises the re-cap after the bonus.
  const r = core.scoreHour(
    { meanKts: 18, gustKts: 18, dirDeg: 90, daylight: true },
    { state: 'flood', height: 2.5, range: 3.6, springsCoeff: 1, hoursToNext: 2, nextKind: 'high' },
    'advanced', fullSpot
  );
  assert.ok(r.score <= 3, `offshore must cap at 3 even with max bonus conditions, got ${r.score}`);
  assert.equal(r.flags.offshore, true);
  assert.equal(r.flags.windAgainstTide, true, 'this case must exercise an active bonus to prove the re-cap');
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

function goldenEntry(meanKts, opposed, daylight) {
  return { meanKts, opposed, daylight };
}

test('goldenWindows: a 5-hour opposed run at 16kts daylight is one window', () => {
  const entries = [
    goldenEntry(10, false, true),
    goldenEntry(16, true, true),
    goldenEntry(17, true, true),
    goldenEntry(16, true, true),
    goldenEntry(18, true, true),
    goldenEntry(16, true, true),
    goldenEntry(10, false, true),
  ];
  const windows = core.goldenWindows(entries, { minKts: 15, minHours: 3 });
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0], { startIdx: 1, endIdx: 5 });
});

test('goldenWindows: a run broken by one non-opposed hour into 2h+2h yields no windows', () => {
  const entries = [
    goldenEntry(16, true, true),
    goldenEntry(16, true, true),
    goldenEntry(16, false, true), // breaks the run
    goldenEntry(16, true, true),
    goldenEntry(16, true, true),
  ];
  const windows = core.goldenWindows(entries, { minKts: 15, minHours: 3 });
  assert.equal(windows.length, 0);
});

test('goldenWindows: 3 hours at 14kts (below minKts) yields no window', () => {
  const entries = [
    goldenEntry(14, true, true),
    goldenEntry(14, true, true),
    goldenEntry(14, true, true),
  ];
  const windows = core.goldenWindows(entries, { minKts: 15, minHours: 3 });
  assert.equal(windows.length, 0);
});

test('goldenWindows: respects custom opts', () => {
  const entries = [
    goldenEntry(20, true, true),
    goldenEntry(20, true, true),
  ];
  assert.equal(core.goldenWindows(entries, { minKts: 15, minHours: 3 }).length, 0);
  const windows = core.goldenWindows(entries, { minKts: 15, minHours: 2 });
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0], { startIdx: 0, endIdx: 1 });
});
