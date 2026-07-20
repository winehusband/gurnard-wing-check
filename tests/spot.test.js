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
