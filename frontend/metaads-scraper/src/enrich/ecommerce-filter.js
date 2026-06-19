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
  'tiktok.com', 'tiktokshop.com', 'meta.com', 'instagram.com', 'whatsapp.com',
  'facebook.com', 'pinterest.com', 'snapchat.com', 'youtube.com', 'google.com',
  'microsoft.com', 'apple.com', 'samsung.com', 'lg.com', 'sony.com',
  'expedia.com', 'booking.com', 'airbnb.com', 'uber.com', 'doordash.com',
  'grubhub.com', 'instacart.com', 'wayfair.com', 'etsy.com',
];

// Enterprise / marketplace brand names that frequently appear as Page Names.
// Matched case-insensitively against full pageName or its tokens.
// Critical because Meta wraps click-throughs in l.facebook.com so landingUrl
// is sometimes empty and domain-based detection alone misses these brands.
const ENTERPRISE_PAGE_NAMES = [
  'amazon', 'amazon beauty', 'amazon fashion', 'amazon prime', 'amazon shopping',
  'amazon music', 'amazon kids', 'amazon basics', 'amazon ads', 'amazon devices',
  'amazon home', 'amazon fresh', 'amazon books', 'amazon games', 'amazon kindle',
  'amazon prime video', 'amazon prime gaming', 'amazon advertising',
  'temu',
  'shein',
  'aliexpress', 'alibaba',
  'walmart', 'target', 'ebay', 'wish', 'best buy',
  'tiktok', 'tiktok shop', 'tiktok - us', 'tiktok ads',
  'instagram', 'facebook', 'meta', 'whatsapp', 'messenger', 'threads',
  'google', 'google ads', 'google play', 'youtube', 'youtube music', 'youtube tv',
  'microsoft', 'xbox', 'office 365', 'linkedin',
  'apple', 'apple music', 'apple tv',
  'pinterest', 'snapchat', 'reddit', 'x corp', 'twitter',
  'expedia', 'booking.com', 'booking', 'airbnb', 'uber', 'uber eats', 'lyft',
  'doordash', 'grubhub', 'instacart', 'etsy', 'wayfair',
  'samsung', 'lg', 'sony', 'huawei', 'xiaomi',
  'nike', 'adidas', 'gap', 'h&m', 'zara',
  'shopify', 'klarna', 'paypal', 'venmo', 'cash app',
  'chime', 'sofi', 'capital one', 'american express', 'visa', 'mastercard',
  'netflix', 'disney+', 'hulu', 'hbo max', 'paramount+', 'peacock', 'spotify',
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
 * Detect if pageName matches a known enterprise/marketplace brand.
 * Critical: Meta wraps destination URLs in l.facebook.com, so landingUrl
 * is often empty. Page-name matching is our primary defence against
 * Amazon / Temu / TikTok / Shein dominating niche searches.
 */
function isEnterprisePageName(pageName) {
  if (!pageName) return false;
  const normalized = String(pageName).trim().toLowerCase();
  if (!normalized) return false;
  for (const brand of ENTERPRISE_PAGE_NAMES) {
    if (normalized === brand) return true;
    if (normalized.startsWith(brand + ' ')) return true;
    if (normalized.startsWith(brand + ' - ')) return true;
    if (normalized.startsWith(brand + ': ')) return true;
    if (normalized.endsWith(' ' + brand)) return true;
  }
  return false;
}

/**
 * Combined enterprise detection — either by URL or by page name.
 */
function isEnterpriseBrand(ad) {
  return isEnterpriseDomain(ad?.landingUrl) || isEnterprisePageName(ad?.pageName);
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

  // Negative signals — HARD reject for enterprise brands by domain OR name.
  // Score is clamped to 0 so they always fall below any minScore filter.
  if (isEnterpriseBrand(ad)) {
    return 0;
  }

  // Positive signals (increase score)
  if (detectShopify(ad.landingUrl)) {
    score += 30;  // Strong Shopify signal (increased from 25)
  }

  if (ad.landingUrl && !isEnterpriseDomain(ad.landingUrl)) {
    // Has a landing page and it's not enterprise
    score += 12;  // Increased from 10
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
  if (isEnterpriseBrand(ad)) return 'enterprise-marketplace';
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
