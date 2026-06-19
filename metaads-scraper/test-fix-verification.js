// =============================================================================
// Production bug fix verification (no Playwright needed).
//
// Verifies:
//   FIX #1  fbcdn URL preservation — signed params (oh, oe, ccb, _nc_ohc)
//           must survive the scraper unchanged.
//   FIX #2  l.facebook.com/l.php?u=... redirect unwrap → real Amazon URL.
//   FIX #3  isEnterprisePageName / isEnterpriseBrand → block Amazon/Temu.
//   FIX #4  filterEcommerce now drops enterprise ads to score 0.
// =============================================================================

const {
  scoreEcommerceLikelihood,
  isEnterpriseDomain,
  isEnterprisePageName,
  isEnterpriseBrand,
  filterEcommerce,
  classifyBrandType,
} = require('./src/enrich/ecommerce-filter');

let failed = 0;
let passed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.log(`  FAIL  ${label}  ${detail}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// -----------------------------------------------------------------------------
// FIX #1 — URL preservation logic.
// We replicate preserveMediaUrl (it lives inside page.evaluate so we re-derive
// it here for unit testing — it's a pure function).
// -----------------------------------------------------------------------------
function preserveMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().replace(/&amp;/g, '&');
  try {
    new URL(trimmed);
    return trimmed;
  } catch (_) {
    return '';
  }
}

section('FIX #1: fbcdn URL preservation (signed params must survive)');

const realFbcdn =
  'https://scontent-sin11-2.xx.fbcdn.net/v/t39.35426-6/674428350_1484150483064834_7592353902377146681_n.jpg' +
  '?stp=dst-jpg_s60x60_tt6' +
  '&_nc_cat=104&_nc_sid=c53f8f&_nc_ohc=RESOURCE_HANDLE_ABC' +
  '&_nc_oc=ADuFv00&_nc_zt=14&_nc_ht=scontent-sin11-2.xx&_nc_gid=ABC' +
  '&oh=00_AfTSiGn4tureH4shAbcDef&oe=68ABCDEF&ccb=1-7';

const out = preserveMediaUrl(realFbcdn);
assert('output is non-empty string', typeof out === 'string' && out.length > 0);
assert('oh (HMAC signature) preserved', out.includes('oh=00_AfTSiGn4tureH4shAbcDef'),
  `got: ${out}`);
assert('oe (origin expiry) preserved', out.includes('oe=68ABCDEF'));
assert('ccb (cache control byte) preserved', out.includes('ccb=1-7'));
assert('_nc_ohc (resource handle) preserved', out.includes('_nc_ohc=RESOURCE_HANDLE_ABC'));
assert('_nc_cat preserved (no longer stripped)', out.includes('_nc_cat=104'));
assert('_nc_sid preserved', out.includes('_nc_sid=c53f8f'));
assert('stp routing param preserved', out.includes('stp=dst-jpg_s60x60_tt6'));
assert('URL is unchanged byte-for-byte', out === realFbcdn,
  `\n     before: ${realFbcdn}\n     after:  ${out}`);

// HTML-entity-encoded ampersands sometimes appear when src comes from innerHTML
const entityEncoded = realFbcdn.replace(/&/g, '&amp;');
const decoded = preserveMediaUrl(entityEncoded);
assert('&amp; entity decoded back to &', !decoded.includes('&amp;') && decoded === realFbcdn);

assert('empty input → empty string', preserveMediaUrl('') === '');
assert('null input → empty string', preserveMediaUrl(null) === '');
assert('garbage input → empty string', preserveMediaUrl('not a url') === '');

// -----------------------------------------------------------------------------
// FIX #2 — l.facebook.com/l.php?u=... redirect unwrapping.
// Replicate the inline logic from extractAds for unit testing.
// -----------------------------------------------------------------------------
function unwrapLandingUrl(href) {
  if (!href || /^javascript:/i.test(href) || !/^https?:\/\//i.test(href)) return '';
  const m = href.match(/^https?:\/\/l[m]?\.facebook\.com\/l\.php\?(?:[^#]*&)?u=([^&#]+)/i);
  if (m) {
    try {
      const u = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(u)) return u;
    } catch (_) {}
  }
  if (!/facebook\.com/i.test(href)) return href;
  return '';
}

section('FIX #2: l.facebook.com/l.php?u= redirect unwrapping');

const wrappedAmazon =
  'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.amazon.com%2Fdp%2FB0CXYZ123%3Fref%3DfbAd&h=AT2abc';
const unwrapped = unwrapLandingUrl(wrappedAmazon);
assert('Amazon URL extracted from l.facebook.com wrapper',
  unwrapped === 'https://www.amazon.com/dp/B0CXYZ123?ref=fbAd',
  `got: ${unwrapped}`);

const wrappedTemu =
  'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.temu.com%2Fchannel%2Ffashion.html&h=AT_xyz';
assert('Temu URL extracted from l.facebook.com wrapper',
  unwrapLandingUrl(wrappedTemu) === 'https://www.temu.com/channel/fashion.html');

const wrappedMobile =
  'https://lm.facebook.com/l.php?u=https%3A%2F%2Fshein.com%2Fdress&h=AT9';
assert('lm.facebook.com (mobile redirect) also unwrapped',
  unwrapLandingUrl(wrappedMobile) === 'https://shein.com/dress');

const directDtc = 'https://glossier.com/products/cloud-paint';
assert('direct (non-facebook) URL passes through unchanged',
  unwrapLandingUrl(directDtc) === directDtc);

const fbPage = 'https://www.facebook.com/some-page';
assert('non-wrapped facebook.com URL is correctly skipped',
  unwrapLandingUrl(fbPage) === '');

// -----------------------------------------------------------------------------
// FIX #3 — Enterprise detection by page name
// -----------------------------------------------------------------------------
section('FIX #3: isEnterprisePageName / isEnterpriseBrand');

assert('Amazon page name → enterprise', isEnterprisePageName('Amazon'));
assert('"Amazon Fashion" page name → enterprise', isEnterprisePageName('Amazon Fashion'));
assert('"AMAZON.COM" page name → enterprise (case-insensitive)', isEnterprisePageName('AMAZON.COM'));
assert('Temu page name → enterprise', isEnterprisePageName('Temu'));
assert('"TikTok Shop" page name → enterprise', isEnterprisePageName('TikTok Shop'));
assert('SHEIN page name → enterprise', isEnterprisePageName('SHEIN'));
assert('"Walmart" page name → enterprise', isEnterprisePageName('Walmart'));
assert('"Amazonia Coffee" (false positive guard) → NOT enterprise',
  !isEnterprisePageName('Amazonia Coffee'));
assert('"Real DTC Brand" → NOT enterprise', !isEnterprisePageName('Real DTC Brand'));
assert('"Glossier" → NOT enterprise', !isEnterprisePageName('Glossier'));
assert('empty/null → NOT enterprise',
  !isEnterprisePageName('') && !isEnterprisePageName(null) && !isEnterprisePageName(undefined));

// Combined isEnterpriseBrand — works when EITHER name OR domain matches
assert('isEnterpriseBrand: name=Amazon, no URL → true',
  isEnterpriseBrand({ pageName: 'Amazon', landingUrl: '' }));
assert('isEnterpriseBrand: name=Glossier, URL=amazon.com → true (domain wins)',
  isEnterpriseBrand({ pageName: 'Glossier', landingUrl: 'https://www.amazon.com/x' }));
assert('isEnterpriseBrand: name=Glossier, URL=glossier.com → false',
  !isEnterpriseBrand({ pageName: 'Glossier', landingUrl: 'https://glossier.com/x' }));

// -----------------------------------------------------------------------------
// FIX #4 — Full filterEcommerce pipeline blocks Amazon/Temu/TikTok Shop
// -----------------------------------------------------------------------------
section('FIX #4: filterEcommerce excludes enterprise from search results');

const testAds = [
  // Amazon — pageName only (landingUrl never extracted because of l.facebook wrap)
  { adId: '1', pageName: 'Amazon', landingUrl: '', adCopy: 'Shop deals on Amazon', cta: 'Shop Now' },
  // Temu — pageName + correctly-unwrapped landingUrl
  { adId: '2', pageName: 'Temu', landingUrl: 'https://www.temu.com/x', adCopy: 'Crazy prices', cta: 'Buy Now' },
  // TikTok Shop — pageName only
  { adId: '3', pageName: 'TikTok Shop', landingUrl: '', adCopy: 'Trending now', cta: 'Shop Now' },
  // SHEIN
  { adId: '4', pageName: 'SHEIN', landingUrl: 'https://shein.com/dress', adCopy: 'Fast fashion', cta: 'Shop Now' },
  // Real DTC — Glossier
  { adId: '5', pageName: 'Glossier', landingUrl: 'https://glossier.com/products/cloud-paint',
    adCopy: 'Real customers love our cloud paint. Free shipping. Limited time.',
    cta: 'Shop Now', mediaType: 'video' },
  // Another DTC
  { adId: '6', pageName: 'Cariuma', landingUrl: 'https://cariuma.com/products/oca-low',
    adCopy: 'Eco-friendly sneakers. 50% off today only.', cta: 'Shop Now' },
];

const scored = testAds.map(ad => ({
  ad,
  score: scoreEcommerceLikelihood(ad),
  brandType: classifyBrandType(ad, scoreEcommerceLikelihood(ad)),
}));

console.log('\n  Score table:');
scored.forEach(({ ad, score, brandType }) => {
  console.log(`    ${ad.adId}  ${ad.pageName.padEnd(14)}  score=${String(score).padStart(3)}  type=${brandType}`);
});

assert('Amazon score = 0 (heavy penalty applied via pageName)',
  scored[0].score === 0, `got ${scored[0].score}`);
assert('Temu score = 0', scored[1].score === 0, `got ${scored[1].score}`);
assert('TikTok Shop score = 0', scored[2].score === 0, `got ${scored[2].score}`);
assert('SHEIN score = 0', scored[3].score === 0, `got ${scored[3].score}`);
assert('Glossier (DTC) score >= 50', scored[4].score >= 50, `got ${scored[4].score}`);
assert('Cariuma (DTC) score >= 50', scored[5].score >= 50, `got ${scored[5].score}`);

assert('Amazon classified as enterprise-marketplace',
  scored[0].brandType === 'enterprise-marketplace');
assert('Temu classified as enterprise-marketplace',
  scored[1].brandType === 'enterprise-marketplace');
assert('TikTok Shop classified as enterprise-marketplace',
  scored[2].brandType === 'enterprise-marketplace');

const filtered = filterEcommerce(testAds, 50);
console.log(`\n  After filterEcommerce(minScore=50):`);
filtered.forEach(a => console.log(`    KEPT: ${a.adId}  ${a.pageName}  score=${a.ecommerceScore}`));

assert('filterEcommerce keeps only DTC brands (2 results)', filtered.length === 2,
  `got ${filtered.length}: ${filtered.map(a => a.pageName).join(', ')}`);
assert('Amazon NOT in filtered output', !filtered.some(a => a.pageName === 'Amazon'));
assert('Temu NOT in filtered output', !filtered.some(a => a.pageName === 'Temu'));
assert('TikTok Shop NOT in filtered output', !filtered.some(a => a.pageName === 'TikTok Shop'));
assert('SHEIN NOT in filtered output', !filtered.some(a => a.pageName === 'SHEIN'));
assert('Glossier IS in filtered output', filtered.some(a => a.pageName === 'Glossier'));
assert('Cariuma IS in filtered output', filtered.some(a => a.pageName === 'Cariuma'));

// -----------------------------------------------------------------------------
section('Summary');
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
