const { test, expect } = require('@playwright/test');

// Served by the Playwright webServer (see playwright.config.js) rather than
// opened via file://: Chrome blocks fetch() of file:// resources from a
// file:// page, which breaks the app's `fetch('spot.json')` call.
const APP_URL = '/index.html';

function openMeteoFixture(opts) {
  const o = opts || {};
  const windSpeed = o.wind !== undefined ? o.wind : 13;
  const gustSpeed = o.gust !== undefined ? o.gust : 15;
  const dirDeg = o.dir !== undefined ? o.dir : 230; // steady cross-shore SW by default
  const time = [];
  const wind = [];
  const gusts = [];
  const dir = [];
  const today = new Date();
  today.setMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++) {
    const t = new Date(today.getTime() + i * 3600 * 1000);
    time.push(t.toISOString().slice(0, 16));
    wind.push(windSpeed);
    gusts.push(gustSpeed);
    dir.push(dirDeg);
  }
  const day0 = time[0].slice(0, 10);
  const day1 = time[24].slice(0, 10);
  return {
    hourly: { time, wind_speed_10m: wind, wind_gusts_10m: gusts, wind_direction_10m: dir },
    daily: {
      // Daylight window covers the whole day so scoring doesn't flake
      // depending on what time of day the suite happens to run.
      time: [day0, day1],
      sunrise: [day0 + 'T00:00', day1 + 'T00:00'],
      sunset: [day0 + 'T23:59', day1 + 'T23:59'],
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
  const scoreBefore = await page.locator('#verdictScore').textContent();

  await page.locator('button[data-profile="beginner"]').click();

  await expect(page.locator('button[data-profile="beginner"]')).toHaveClass(/active/);
  const stored = await page.evaluate(() => localStorage.getItem('wing_profile'));
  expect(stored).toBe('beginner');

  // Prove the toggle actually re-scores rather than just recording the click:
  // 13kts is intermediate 4.25 (9/10) but beginner 3.0 (6/10) under this fixture.
  await expect(page.locator('#verdictScore')).not.toHaveText(scoreBefore);
});

test('degraded mode: tide failure falls back to wind-only scoring', async ({ page }) => {
  await page.unroute('**/functions/v1/tide-proxy*');
  await page.route('**/functions/v1/tide-proxy*', (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.addInitScript(() => localStorage.removeItem('wing_tide_cache_v1'));
  await page.goto(APP_URL);
  await expect(page.locator('#dataStatus')).toContainText('wind alone');
  await expect(page.locator('#verdictScore')).not.toHaveText('–');
});

test('offshore hour shows warning', async ({ page }) => {
  await page.unroute('**/api.open-meteo.com/**');
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ json: openMeteoFixture({ dir: 170, wind: 18, gust: 20 }) }));
  await page.goto(APP_URL);
  await expect(page.locator('.hour-cell').first()).toBeVisible();

  // Offshore S-SSW band caps score at 2 (< 3.5 green threshold), so no
  // hour cell anywhere in the strip should ever render green.
  await expect(page.locator('.hour-cell.score-green')).toHaveCount(0);

  await page.locator('.hour-cell').first().click();
  await expect(page.locator('#reasonsModal')).toHaveClass(/open/);
  const reasonsText = await page.locator('#reasonsList').textContent();
  expect(reasonsText).toMatch(/offshore/i);
  expect(reasonsText).toMatch(/never ride this alone/i);
});
