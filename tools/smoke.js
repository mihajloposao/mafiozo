// Headless smoke test: plays three random lives and fails on any page error.
// Run: node tools/smoke.js [screenshot.png]   (uses the preinstalled Playwright Chromium)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const clickAny = async sel => {
    const els = await page.$$(sel);
    if (els.length) await els[Math.floor(Math.random() * els.length)].click();
    return els.length > 0;
  };
  let shot = false;
  for (let life = 1; life <= 3; life++) {
    await page.click('button[type=submit]');
    for (let step = 0; step < 1200 && !(await page.$('.dead')); step++) {
      if (await clickAny('.overlay.modal:not([hidden]) button:not([disabled])')) continue;
      if (await page.$('.overlay.sheet:not([hidden])')) {
        if (!(await clickAny('.overlay.sheet:not([hidden]) .item:not([disabled])'))) await page.click('[data-close]');
        continue;
      }
      if (Math.random() < 0.5) {
        await page.click(`[data-sheet=${['activities', 'crime'][step % 2]}]`);
        continue;
      }
      if (!shot && step > 80 && process.argv[2]) { shot = true; await page.screenshot({ path: process.argv[2] }); }
      await page.click('[data-do=age]');
    }
    const summary = await page.$eval('.dead', el => el.innerText.replace(/\s+/g, ' ').slice(0, 200)).catch(() => 'still alive');
    console.log(`life ${life}: ${summary}`);
    await clickAny('.overlay.modal:not([hidden]) button:not([disabled])');
    await page.evaluate(() => DO.restart()); // also ends a life that is still going
  }
  await browser.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  process.exit(errors.length ? 1 : 0);
})();
