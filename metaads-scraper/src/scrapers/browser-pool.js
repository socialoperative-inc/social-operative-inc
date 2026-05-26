// Singleton browser instance — reused across requests for performance.
// Recycles every N pages to avoid memory bloat from Meta's heavy DOM.
const { chromium } = require('playwright');
const config = require('../config');
const log = require('../utils/logger');

let browser = null;
let pagesServed = 0;
const RECYCLE_AFTER = 80;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  log.info('[browser] launching chromium', { headless: config.scraper.headless });
  browser = await chromium.launch({
    headless: config.scraper.headless,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-zygote',
    ],
  });
  browser.on('disconnected', () => {
    log.warn('[browser] disconnected — will relaunch on next request');
    browser = null;
  });
  return browser;
}

async function newContext() {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: config.scraper.userAgent,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: { width: 1440, height: 900 },
    bypassCSP: true,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  // Lightweight stealth tweaks (full puppeteer-extra-plugin-stealth pulls in puppeteer; we do the essentials inline).
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = window.chrome || { runtime: {} };
    } catch (_) {}
  });
  return context;
}

async function withPage(fn) {
  const context = await newContext();
  const page = await context.newPage();
  try {
    const result = await fn(page);
    pagesServed += 1;
    return result;
  } finally {
    try {
      await page.close({ runBeforeUnload: false });
    } catch (_) {}
    try {
      await context.close();
    } catch (_) {}
    if (pagesServed >= RECYCLE_AFTER && browser) {
      log.info('[browser] recycling after pagesServed=' + pagesServed);
      try {
        await browser.close();
      } catch (_) {}
      browser = null;
      pagesServed = 0;
    }
  }
}

async function shutdown() {
  if (browser) {
    try {
      await browser.close();
    } catch (_) {}
    browser = null;
  }
}

module.exports = { withPage, shutdown };
