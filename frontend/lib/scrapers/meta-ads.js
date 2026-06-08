// Meta Ads Library scraper - rich raw data for AI analysis
const { chromium } = require('playwright');

async function scrapeMetaAds({ query, country = 'US', limit = 12 }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
    });
    const page = await context.newPage();
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);

    try { await page.click('button[data-cookiebanner="accept_button"]', { timeout: 1500 }); } catch {}
    try { await page.click('div[role="button"]:has-text("Allow all cookies")', { timeout: 1500 }); } catch {}
    try { await page.click('div[aria-label="Close"]', { timeout: 1500 }); } catch {}
    await page.waitForTimeout(2000);

    // Initial scroll to load list
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1800));
      await page.waitForTimeout(1400);
    }

    // Scroll back to top, then walk each card into view to trigger lazy hydration
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    // Find approximate card positions and scroll to each
    await page.evaluate(async (max) => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const libIdRegex = /Library ID:\s*\d+/;
      const cards = Array.from(document.querySelectorAll('div')).filter(d => {
        const t = d.innerText || '';
        return libIdRegex.test(t) && t.length > 50 && t.length < 4000;
      }).slice(0, max);
      for (const c of cards) {
        c.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(450);
      }
      window.scrollTo(0, 0);
      await sleep(800);
    }, limit);

    await page.waitForTimeout(2000);

    const ads = await page.evaluate((max) => {
      const libIdRegex = /Library ID:\s*(\d+)/;
      const cardMap = new Map();
      const allDivs = Array.from(document.querySelectorAll('div'));

      // Find smallest div containing Library ID
      for (const div of allDivs) {
        const text = div.innerText || '';
        const m = text.match(libIdRegex);
        if (!m) continue;
        const id = m[1];
        if (text.length > 50 && text.length < 8000) {
          const existing = cardMap.get(id);
          if (!existing || text.length < existing.text.length) {
            cardMap.set(id, { el: div, text });
          }
        }
      }

      const results = [];
      for (const [libraryId, { el, text }] of cardMap.entries()) {
        if (results.length >= max) break;

        // Walk UP the DOM to find the full ad card (must contain images OR much more text)
        let card = el;
        let bestCard = el;
        for (let i = 0; i < 12; i++) {
          if (!card.parentElement) break;
          card = card.parentElement;
          const imgs = card.querySelectorAll('img');
          const fbcdnImgs = Array.from(imgs).filter(im => im.src && /fbcdn|scontent/i.test(im.src));
          const cardText = card.innerText || '';
          // Stop when we hit a container that's clearly multiple ads (contains 2+ "Library ID:" instances)
          const libIdCount = (cardText.match(/Library ID:/g) || []).length;
          if (libIdCount > 1) break;
          // This card now has the visible image/video
          if (fbcdnImgs.length > 0 || cardText.length > text.length + 200) {
            bestCard = card;
          }
          // Stop if card is huge (likely whole page)
          if (cardText.length > 12000) break;
        }

        const fullText = bestCard.innerText || text;
        const statusMatch = fullText.match(/^(Active|Inactive)/m);
        const startedMatch = fullText.match(/Started running on\s+([^·\n]+)/);

        const imgs = bestCard.querySelectorAll('img');
        const imageUrls = Array.from(imgs)
          .map(i => i.src)
          .filter(s => s && !s.startsWith('data:') && /scontent|fbcdn/i.test(s))
          .filter((s, i, arr) => arr.indexOf(s) === i)
          .slice(0, 4);

        const videos = bestCard.querySelectorAll('video');
        const videoUrls = Array.from(videos).map(v => v.src).filter(Boolean).slice(0, 2);

        // Find advertiser: look for anchor/link with brand-like text
        let advertiser = '';
        const anchors = bestCard.querySelectorAll('a');
        for (const a of anchors) {
          const t = (a.innerText || '').trim();
          if (t && t.length > 1 && t.length < 60 &&
              !/Library ID|Started|Platforms|See ad|details|Sponsored|Categories|^Active$|^Inactive$|Open Dropdown|ads? use this|Learn More|Shop Now|Sign Up|See More/i.test(t)) {
            advertiser = t;
            break;
          }
        }

        results.push({
          libraryId,
          status: statusMatch ? statusMatch[1] : 'Active',
          startedRunning: startedMatch ? startedMatch[1].trim() : null,
          advertiser: advertiser || null,
          rawText: fullText.slice(0, 2000),
          imageUrls,
          videoUrls,
          hasMedia: imageUrls.length > 0 || videoUrls.length > 0,
          adUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
        });
      }

      return results;
    }, limit);

    return ads;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMetaAds };
