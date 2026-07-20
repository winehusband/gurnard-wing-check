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
