// Stage-by-stage URL trace through the REAL production code path.
// Runs the patched extractAds() inside headless Chromium against a synthesized
// Meta Ads DOM fixture, then traces ONE image URL byte-for-byte through every
// stage so we can prove the API response equals the raw DOM URL.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAW =
  'https://scontent-sin11-2.xx.fbcdn.net/v/t39.35426-6/' +
  '674428350_1484150483064834_7592353902377146681_n.jpg' +
  '?stp=dst-jpg_s60x60_tt6' +
  '&_nc_cat=104' +
  '&_nc_sid=c53f8f' +
  '&_nc_ohc=ResourceHandleABC' +
  '&_nc_oc=ADuFv00' +
  '&_nc_zt=14' +
  '&_nc_ht=scontent-sin11-2.xx' +
  '&_nc_gid=GidValueXYZ' +
  '&oh=00_AfTSiGn4tureH4shAbcDef' +
  '&oe=68ABCDEF' +
  '&ccb=1-7';

const L_FB_AMAZON =
  'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.amazon.com%2Fdp%2FB0CXYZ123%3Fref%3DfbAd&h=AT2abc';

const fixtureHtml = `<!doctype html><html><body>
  <div>
    <a role="link" href="https://www.facebook.com/amazon/">Amazon</a>
    <div>Library ID: 999999999</div>
    <div>Started running on Jun 1, 2026</div>
    <div>Active</div>
    <div>Platforms · Facebook · Instagram</div>
    <img src="${RAW}" />
    <div role="button">Shop Now</div>
    <a href="${L_FB_AMAZON}">Visit website</a>
    <div>Shop the latest deals on Amazon. Free shipping. Limited time offers.</div>
  </div>
</body></html>`;

// Load the real production extractAds body
const scraperSrc = fs.readFileSync(
  path.join(__dirname, 'src/scrapers/meta-ads-library.js'), 'utf8'
);
const m = scraperSrc.match(
  /async function extractAds\(page, hardLimit\) \{\s*return page\.evaluate\(\(HARD_LIMIT\) => \{([\s\S]*?)\n  \}, hardLimit\);\s*\}/
);
const extractBody = m[1];

// Real production enrichment + cache pipeline (same modules the route uses)
const { enrichBatch } = require('./src/enrich');
const { filterEcommerce } = require('./src/enrich/ecommerce-filter');
const memoryCache = require('./src/cache/memory');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext()).newPage();
  await page.setContent(fixtureHtml);

  console.log('================================================================');
  console.log('STAGE 1 — RAW Meta DOM URL (img.src in the live page)');
  console.log('================================================================');
  const rawDomUrl = await page.evaluate(() => document.querySelector('img').src);
  console.log(rawDomUrl);

  // Run the REAL extractAds body
  const ads = await page.evaluate(({ body, HARD_LIMIT }) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('HARD_LIMIT', body);
    return fn(HARD_LIMIT);
  }, { body: extractBody, HARD_LIMIT: 5 });
  await browser.close();

  const ad = ads[0];

  console.log('\n================================================================');
  console.log('STAGE 2 — After preserveMediaUrl() (output of img-extraction map)');
  console.log('================================================================');
  console.log(ad.imageUrls[0]);

  console.log('\n================================================================');
  console.log('STAGE 3 — After deduplication (`uniqueImages`) → imageUrl field');
  console.log('================================================================');
  console.log(ad.imageUrl);

  // Simulate the L1 memory cache step that routes/ads.js performs
  const cacheKey = 'ads:amazon:US:all:all:30:dtctrue';
  const enriched = enrichBatch([ad]);
  const filtered = filterEcommerce(enriched, 50);
  const apiPayload = { ads: enriched, filteredAds: filtered, meta: { query: 'amazon' } };
  memoryCache.set(cacheKey, apiPayload, 600);
  const fromCache = memoryCache.get(cacheKey);
  const finalApiUrl = fromCache.ads[0].imageUrl;

  console.log('\n================================================================');
  console.log('STAGE 4 — Final API JSON response URL (read from L1 memory cache)');
  console.log('================================================================');
  console.log(finalApiUrl);

  // ============================ ASSERTIONS ===============================
  console.log('\n================================================================');
  console.log('PROOF — URL is byte-identical at every stage');
  console.log('================================================================');
  console.log('STAGE 1 length:', rawDomUrl.length);
  console.log('STAGE 2 length:', ad.imageUrls[0].length);
  console.log('STAGE 3 length:', ad.imageUrl.length);
  console.log('STAGE 4 length:', finalApiUrl.length);
  console.log('All four identical to RAW input:',
    rawDomUrl === RAW &&
    ad.imageUrls[0] === RAW &&
    ad.imageUrl === RAW &&
    finalApiUrl === RAW);

  console.log('\n================================================================');
  console.log('PROOF — Signed params still present in FINAL API URL');
  console.log('================================================================');
  const checks = [
    ['oh= (HMAC signature)',   /[?&]oh=00_AfTSiGn4tureH4shAbcDef(&|$)/],
    ['oe= (origin expiry)',    /[?&]oe=68ABCDEF(&|$)/],
    ['ccb= (cache control)',   /[?&]ccb=1-7(&|$)/],
    ['_nc_ohc= (handle)',      /[?&]_nc_ohc=ResourceHandleABC(&|$)/],
    ['_nc_cat= (cdn category)',/[?&]_nc_cat=104(&|$)/],
    ['_nc_sid= (session id)',  /[?&]_nc_sid=c53f8f(&|$)/],
    ['stp= (transform spec)',  /[?&]stp=dst-jpg_s60x60_tt6(&|$)/],
  ];
  for (const [name, re] of checks) {
    const ok = re.test(finalApiUrl);
    console.log(`  ${ok ? 'YES' : 'NO '}  ${name}`);
  }

  console.log('\n================================================================');
  console.log('PROOF — Amazon ad before / after filtering');
  console.log('================================================================');
  console.log('BEFORE filterEcommerce:');
  console.log('  pageName    =', JSON.stringify(enriched[0].pageName));
  console.log('  landingUrl  =', JSON.stringify(enriched[0].landingUrl));
  console.log('  ecomScore   =', enriched[0].enrichment.ecommerceScore);
  console.log('  brandType   =', enriched[0].enrichment.brandType);
  console.log('  isEnterprise=', enriched[0].enrichment.isEnterprise);
  console.log('AFTER filterEcommerce(minScore=50):');
  console.log('  filtered.length =', filtered.length);
  console.log('  Amazon present  =', filtered.some(a => a.pageName === 'Amazon'));
  console.log('  Verdict         =', filtered.some(a => a.pageName === 'Amazon')
    ? 'INCLUDED (BUG)' : 'EXCLUDED (correct)');

  // Hash both URLs for byte-equality proof
  const crypto = require('crypto');
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
  console.log('\n================================================================');
  console.log('PROOF — Browser receives byte-identical URL (SHA-256 hashes)');
  console.log('================================================================');
  console.log('  Hash of original input RAW       :', hash(RAW));
  console.log('  Hash of STAGE 1 (DOM .src)       :', hash(rawDomUrl));
  console.log('  Hash of STAGE 2 (after preserve) :', hash(ad.imageUrls[0]));
  console.log('  Hash of STAGE 3 (deduped)        :', hash(ad.imageUrl));
  console.log('  Hash of STAGE 4 (API response)   :', hash(finalApiUrl));
  console.log('  → If all 5 hashes match, browser <img src> request is the SAME bytes.');
})();
