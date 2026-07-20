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
  assert.equal(core.directionBand(230, spot.bands).name, 'Cross-shore SW');
  assert.equal(core.directionBand(300, spot.bands).name, 'Cross-on W–NW');
  assert.equal(core.directionBand(10, spot.bands).name, 'Onshore N–NE'); // wraparound band 330-50
  assert.equal(core.directionBand(345, spot.bands).name, 'Onshore N–NE');
  assert.equal(core.directionBand(90, spot.bands).name, 'Cross-off E–SE');
  assert.equal(core.directionBand(170, spot.bands).name, 'Offshore S–SSW');
  assert.equal(core.directionBand(170, spot.bands).cap, 2);
  assert.equal(core.directionBand(170, spot.bands).offshore, true);
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
