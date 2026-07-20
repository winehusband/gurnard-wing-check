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

test('gustPenalty: steady wind unpunished, gusty wind punished', () => {
  assert.equal(core.gustPenalty(20, 24), 0);            // factor 1.2
  assert.equal(core.gustPenalty(20, 28), 0);            // factor 1.4 exactly
  assert.ok(Math.abs(core.gustPenalty(18, 30) - 1.333) < 0.01); // factor 1.67
  assert.equal(core.gustPenalty(15, 30), 2);            // factor 2.0, clamped
  assert.equal(core.gustPenalty(0, 10), 0);             // no mean -> no penalty
  assert.equal(core.gustPenalty(20, undefined), 0);     // missing gust data
});
