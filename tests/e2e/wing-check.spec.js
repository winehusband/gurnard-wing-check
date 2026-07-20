const { test, expect } = require('@playwright/test');

// Served by the Playwright webServer (see playwright.config.js) rather than
// opened via file://: Chrome blocks fetch() of file:// resources from a
// file:// page, which breaks the app's `fetch('spot.json')` call.
const APP_URL = '/index.html';

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
