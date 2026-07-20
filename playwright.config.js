module.exports = {
  testDir: './tests/e2e',
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4173',
  },
  // Chrome blocks fetch() of file:// resources from a file:// page (spot.json
  // fails to load), so the e2e suite is served over a real local HTTP server
  // instead of opening index.html directly via file://.
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
};
