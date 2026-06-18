// Lightweight enrichment: CTA detection, niche classification, engagement signals.
// Heavy AI analysis (hooks, viral score, emotional triggers) lives on the Vercel
// frontend backend via OpenRouter — keeping concerns separated.

const { scoreEcommerceLikelihood, classifyBrandType, isEnterpriseDomain, isEnterpriseBrand, detectShopify } = require('./ecommerce-filter');

const CTA_BUTTONS = [
  'Shop Now', 'Learn More', 'Sign Up', 'Get Offer', 'Order Now', 'Download',
  'Subscribe', 'Book Now', 'Apply Now', 'Get Quote', 'Contact Us',
  'Watch More', 'Install Now', 'Buy Now', 'Send Message', 'Use App', 'Play Game',
  'Get Yours', 'Claim Offer', 'Try Free', 'Start Now',
];
const CTA_STRENGTH = {
  'Shop Now': 9, 'Buy Now': 9, 'Order Now': 9, 'Get Offer': 8,
  'Sign Up': 7, 'Subscribe': 6, 'Apply Now': 7, 'Book Now': 7,
  'Learn More': 5, 'Watch More': 5, 'Download': 7, 'Install Now': 7,
  'Contact Us': 4, 'Send Message': 4, 'Get Quote': 6,
  'Get Yours': 8, 'Claim Offer': 8, 'Try Free': 7, 'Start Now': 6,
};

const NICHE_KEYWORDS = {
  skincare: ['skincare', 'serum', 'moisturizer', 'wrinkle', 'acne', 'glow', 'retinol', 'spf', 'cleanser', 'toner'],
  supplements: ['supplement', 'vitamin', 'collagen', 'protein', 'gummies', 'biotin', 'creatine', 'omega', 'probiotic'],
  fashion: ['dress', 'shirt', 'jeans', 'shoes', 'boots', 'apparel', 'wardrobe', 'outfit', 'hoodie', 'sneakers'],
  fitness: ['fitness', 'workout', 'gym', 'muscle', 'weight loss', 'cardio', 'training', 'exercise'],
  beauty: ['lipstick', 'mascara', 'foundation', 'eyeliner', 'makeup', 'concealer', 'blush', 'eyeshadow'],
  jewelry: ['necklace', 'bracelet', 'ring', 'earring', 'diamond', 'gold', 'silver', 'pendant'],
  home: ['kitchen', 'sofa', 'bedding', 'lamp', 'rug', 'decor', 'furniture', 'curtains'],
  pet: ['dog', 'cat', 'puppy', 'kitten', 'pet food', 'leash', 'collar', 'toys'],
  saas: ['app', 'software', 'platform', 'dashboard', 'analytics', 'crm', 'ai', 'automation'],
  education: ['course', 'class', 'masterclass', 'ebook', 'workshop', 'training', 'certification'],
  gadgets: ['phone', 'watch', 'headphones', 'earbuds', 'speaker', 'charger', 'wireless'],
};

const URGENCY_PATTERNS = [
  /today only/i, /limited time/i, /while supplies last/i, /\d+%\s*off/i,
  /ends (tonight|tomorrow|soon)/i, /last chance/i, /free shipping/i,
  /flash sale/i, /(\d+) hours? left/i, /selling out/i, /act now/i,
];

const HOOK_PATTERNS = [
  { type: 'question', re: /^\s*(why|how|what|did|do|are|is|have|can)\b.*\?/im },
  { type: 'stat-shock', re: /\b\d{2,}%\b/ },
  { type: 'before-after', re: /before\s*\/?\s*after|before and after/i },
  { type: 'testimonial', re: /"[^"]{20,}"|review|customer|verified/i },
  { type: 'curiosity-gap', re: /this (one|simple|weird|crazy) (trick|hack|secret|tip)/i },
  { type: 'callout', re: /^(attention|warning|stop|hey,?)/im },
  { type: 'numbered-list', re: /^\s*\d+\s+(reasons|ways|tips|hacks|secrets|things)/im },
  { type: 'ugc-style', re: /\b(I|my|we)\b.*(love|tried|recommend|finally|discovered)/i },
  { type: 'scarcity', re: /limited|exclusive|rare|sold out|while supplies/i },
  { type: 'social-proof', re: /(\d+[k+]?|thousands of) (customers|reviews|users|people)/i },
];

const EMOTIONAL_TRIGGERS = [
  { type: 'fomo', re: /don't miss|limited|exclusive|last chance|ending soon/i },
  { type: 'aspiration', re: /dream|luxury|premium|elite|transform|upgrade/i },
  { type: 'pain-relief', re: /struggle|problem|pain|tired of|frustrated|fix/i },
  { type: 'curiosity', re: /secret|discover|reveal|surprising|shocking|you won't believe/i },
  { type: 'social-proof', re: /loved by|trusted|\d+k\+? (reviews|customers)|verified/i },
];

function detectCta(text) {
  const t = String(text || '');
  for (const c of CTA_BUTTONS) {
    if (new RegExp('\\b' + c.replace(/\s/g, '\\s+') + '\\b', 'i').test(t)) return c;
  }
  return '';
}

function classifyNiche(adCopy, headline, pageName) {
  const text = `${adCopy} ${headline} ${pageName}`.toLowerCase();
  const scores = {};
  for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
    let s = 0;
    for (const k of keywords) {
      if (text.includes(k)) s += 1;
    }
    if (s > 0) scores[niche] = s;
  }
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'general';
}

function detectHookTypes(adCopy) {
  const found = [];
  for (const p of HOOK_PATTERNS) {
    if (p.re.test(adCopy)) found.push(p.type);
  }
  return found;
}

function detectEmotionalTriggers(adCopy) {
  const found = [];
  for (const t of EMOTIONAL_TRIGGERS) {
    if (t.re.test(adCopy)) found.push(t.type);
  }
  return [...new Set(found)];
}

function detectUrgencyScore(adCopy) {
  let s = 0;
  for (const p of URGENCY_PATTERNS) {
    if (p.test(adCopy)) s += 1;
  }
  return Math.min(s, 5);
}

function detectUgcStyle(ad) {
  const copy = `${ad.adCopy} ${ad.headline}`.toLowerCase();
  let score = 0;
  // First-person language
  if (/\b(i|my|we|our)\b/.test(copy)) score += 1;
  // Testimonial quotes
  if (/"[^"]{30,}"/.test(copy)) score += 2;
  // Review/customer language
  if (/review|customer|verified|tried|recommend/i.test(copy)) score += 1;
  // Video + first-person = strong UGC signal
  if (ad.mediaType === 'video' && /\b(i|my)\b/.test(copy)) score += 2;
  return score >= 2;
}

function estimateEngagementSignals(ad) {
  // Lightweight composite score (0–100) using available signals only.
  // Heavy ML scoring belongs in the frontend AI pipeline.
  let score = 30;
  const copy = ad.adCopy || '';
  if (ad.mediaType === 'video') score += 12;
  if (ad.imageUrls && ad.imageUrls.length > 1) score += 6;
  if (ad.cta) score += CTA_STRENGTH[ad.cta] || 4;
  score += Math.min(detectHookTypes(copy).length * 5, 15);
  score += detectUrgencyScore(copy) * 3;
  if (ad.landingUrl) score += 4;
  if (copy.length > 100 && copy.length < 500) score += 6;
  if (ad.isActive) score += 4;
  // Boost DTC/ecommerce ads
  const ecomScore = scoreEcommerceLikelihood(ad);
  if (ecomScore >= 70) score += 8;
  return Math.min(Math.max(score, 0), 100);
}

function enrichAd(ad) {
  const adCopy = ad.adCopy || '';
  const cta = ad.cta || detectCta(adCopy + ' ' + (ad.headline || ''));
  const niche = classifyNiche(adCopy, ad.headline, ad.pageName);
  const hookTypes = detectHookTypes(adCopy);
  const emotionalTriggers = detectEmotionalTriggers(adCopy);
  const urgencyScore = detectUrgencyScore(adCopy);
  const ctaStrength = CTA_STRENGTH[cta] || 3;
  const isUgc = detectUgcStyle(ad);
  const ecommerceScore = scoreEcommerceLikelihood(ad);
  const brandType = classifyBrandType(ad, ecommerceScore);
  const engagementScore = estimateEngagementSignals({ ...ad, cta });
  
  return {
    ...ad,
    cta,
    enrichment: {
      niche,
      hookTypes,
      emotionalTriggers,
      urgencyScore,
      ctaStrength,
      engagementScore,
      ecommerceScore,
      brandType,
      isUgc,
      isShopify: detectShopify(ad.landingUrl),
      isEnterprise: isEnterpriseBrand(ad),
      wordCount: adCopy.split(/\s+/).filter(Boolean).length,
      hasVideo: ad.mediaType === 'video',
      hasCarousel: (ad.imageUrls || []).length > 1,
    },
  };
}

function enrichBatch(ads) {
  return ads.map(enrichAd);
}

module.exports = { 
  enrichAd, 
  enrichBatch, 
  detectCta, 
  classifyNiche, 
  detectHookTypes, 
  detectEmotionalTriggers,
  estimateEngagementSignals,
  detectUgcStyle,
};
