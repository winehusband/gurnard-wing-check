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
