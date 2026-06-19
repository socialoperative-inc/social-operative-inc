// =============================================================================
// Ecommerce / DTC brand detection and filtering.
// Analyzes landing URLs, brand patterns, and ad creative style to prioritize
// real DTC advertisers over Amazon/Temu/enterprise brands.
// =============================================================================

const ENTERPRISE_DOMAINS = [
  'amazon.com', 'amazon.co', 'amazon.ca', 'amazon.co.uk', 'amazon.de', 'amazon.fr',
  'temu.com', 'walmart.com', 'target.com', 'ebay.com', 'alibaba.com', 'aliexpress.com',
  'shein.com', 'wish.com', 'bestbuy.com', 'homedepot.com', 'lowes.com', 'costco.com',
  'samsclub.com', 'wayfair.com', 'overstock.com', 'jcpenney.com', 'kohls.com',
  'macys.com', 'nordstrom.com', 'bloomingdales.com', 'sears.com', 'kmart.com',
  'tiktok.com', 'shop.tiktok.com', 'instagram.com', 'etsy.com',
];

// Enterprise advertiser PAGE NAMES (case-insensitive substring matches against
// the Facebook page name, NOT the landing URL). Required because:
//   1) Some ads have empty / mangled landingUrl that escapes domain checks.
//   2) Meta sometimes wraps clicks so deeply that we never see the real URL.
// In both cases the Page Name "Amazon" / "Temu" / etc. is the only reliable
// signal that this is an enterprise marketplace, not a DTC brand.
const ENTERPRISE_PAGE_NAMES = [
  'amazon', 'amazon.com', 'amazon prime', 'amazon fashion', 'amazon home',
  'temu', 'temu.com',
  'walmart', 'target', 'ebay', 'aliexpress', 'alibaba',
  'shein', 'wish', 'best buy', 'home depot', "lowe's", 'costco', "sam's club",
  'wayfair', 'overstock', 'jcpenney', "kohl's", "macy's", 'nordstrom',
  'bloomingdale', 'sears', 'kmart',
  'tiktok shop', 'tiktok', 'shop on tiktok',
  'etsy', 'instagram shop',
];

const SHOPIFY_SIGNALS = [
  '/cart', '/products/', '/collections/', 'myshopify.com', 'cdn.shopify.com',
  'checkout.shopify.com', '.myshopify.com',
];

const DTC_CTA_PATTERNS = [
  'Shop Now', 'Order Now', 'Buy Now', 'Get Yours', 'Claim Offer',
  'Limited Stock', 'Exclusive Deal', 'Free Shipping',
];

const DTC_COPY_SIGNALS = [
  /free shipping/i,
  /limited (time|stock|offer)/i,
  /\d+%\s*off/i,
  /today only/i,
  /while supplies last/i,
  /exclusive/i,
  /flash sale/i,
  /act now/i,
  /don't miss/i,
];

const UGC_SIGNALS = [
  /review|customer|testimonial|verified/i,
  /"[^"]{30,}"/,  // quoted testimonial
  /\bI\b.*\blove\b/i,
  /before.*after|before\/after/i,
  /real results/i,
  /try it/i,
];

/**
 * Detect if landing URL is from a known enterprise marketplace.
 */
function isEnterpriseDomain(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    return ENTERPRISE_DOMAINS.some(d => hostname.includes(d));
  } catch (_) {
    return false;
  }
}

/**
 * Detect if a Facebook Page Name belongs to an enterprise marketplace brand.
 * Used as a fallback when landingUrl is missing / mangled / Meta-wrapped.
 */
function isEnterprisePageName(pageName) {
  if (!pageName || typeof pageName !== 'string') return false;
  const name = pageName.trim().toLowerCase();
  if (!name) return false;
  // Exact match OR pageName starts with the enterprise brand (e.g. "Amazon Fashion")
  return ENTERPRISE_PAGE_NAMES.some(brand => {
    if (name === brand) return true;
    // word-boundary check so "amazon" matches "Amazon Prime" but not "amazonia"
    const re = new RegExp('(^|[^a-z0-9])' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])', 'i');
    return re.test(name);
  });
}

/**
 * Combined enterprise detection — true if EITHER the landing URL OR the page
 * name matches a known enterprise marketplace brand.
 */
function isEnterpriseBrand(ad) {
  if (!ad) return false;
  return isEnterpriseDomain(ad.landingUrl) || isEnterprisePageName(ad.pageName);
}

/**
 * Detect Shopify signals in landing URL.
 */
function detectShopify(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return SHOPIFY_SIGNALS.some(sig => lower.includes(sig));
}

/**
 * Score ecommerce likelihood (0-100).
 * Higher = more likely to be a real DTC/ecommerce brand.
 * Lower = enterprise marketplace or non-commerce ad.
 */
function scoreEcommerceLikelihood(ad) {
  let score = 50;  // baseline

  // -----------------------------------------------------------------------
  // ENTERPRISE PENALTY — apply if EITHER landingUrl host OR pageName matches
  // a known enterprise brand. This is critical: previously only landingUrl
  // was checked, and Meta's l.facebook.com/l.php redirect wrapping meant the
  // real Amazon/Temu URL was never visible → no penalty applied → enterprise
  // ads dominated search results.
  // -----------------------------------------------------------------------
  const enterpriseByDomain = isEnterpriseDomain(ad.landingUrl);
  const enterpriseByName = isEnterprisePageName(ad.pageName);
  if (enterpriseByDomain || enterpriseByName) {
    // -100 floors the score to 0 even with bonuses, guaranteeing exclusion
    // when minEcomScore >= 1.
    score -= 100;
  }

  // Positive signals (increase score)
  if (detectShopify(ad.landingUrl)) {
    score += 30;  // Strong Shopify signal
  }

  if (ad.landingUrl && !enterpriseByDomain && !enterpriseByName) {
    score += 12;
  }

  // DTC CTA patterns
  const cta = ad.cta || '';
  if (DTC_CTA_PATTERNS.some(p => cta.includes(p))) {
    score += 10;  // Increased from 8
  }

  // DTC copy signals
  const copy = `${ad.adCopy} ${ad.headline}`.toLowerCase();
  let copySignalCount = 0;
  for (const pattern of DTC_COPY_SIGNALS) {
    if (pattern.test(copy)) copySignalCount++;
  }
  score += Math.min(copySignalCount * 6, 18);  // Increased from 5 -> 6

  // UGC style signals
  let ugcCount = 0;
  for (const pattern of UGC_SIGNALS) {
    if (pattern.test(copy)) ugcCount++;
  }
  score += Math.min(ugcCount * 5, 15);  // Increased from 4 -> 5

  // Performance marketing style
  if (ad.mediaType === 'video' && ugcCount > 0) {
    score += 10;  // UGC video = strong DTC signal (increased from 8)
  }

  // Multi-platform presence
  if ((ad.platforms || []).length >= 2) {
    score += 6;  // Increased from 5
  }

  // Product-focused landing pages
  if (ad.landingUrl && /\/products?\/|\/shop\/|\/store\/|\/buy\//i.test(ad.landingUrl)) {
    score += 8;  // NEW: bonus for product page URLs
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

/**
 * Classify brand type.
 */
function classifyBrandType(ad, ecommerceScore) {
  if (isEnterpriseDomain(ad.landingUrl) || isEnterprisePageName(ad.pageName)) return 'enterprise-marketplace';
  if (detectShopify(ad.landingUrl)) return 'shopify-dtc';
  if (ecommerceScore >= 70) return 'dtc-ecommerce';
  if (ecommerceScore >= 50) return 'small-ecommerce';
  return 'other';
}

/**
 * Filter and sort ads by ecommerce relevance.
 */
function filterEcommerce(ads, minScore = 40) {
  return ads
    .map(ad => ({
      ...ad,
      ecommerceScore: scoreEcommerceLikelihood(ad),
      brandType: classifyBrandType(ad, scoreEcommerceLikelihood(ad)),
    }))
    .filter(ad => ad.ecommerceScore >= minScore)
    .sort((a, b) => b.ecommerceScore - a.ecommerceScore);
}

module.exports = {
  scoreEcommerceLikelihood,
  classifyBrandType,
  filterEcommerce,
  isEnterpriseDomain,
  isEnterprisePageName,
  isEnterpriseBrand,
  detectShopify,
};
