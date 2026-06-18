// USA-only Meta Ads Library scraper.
// Resilient to selector changes — uses multiple fallback strategies.
const { withPage } = require('./browser-pool');
const config = require('../config');
const log = require('../utils/logger');

const BASE = 'https://www.facebook.com/ads/library/';

/**
 * Build a Meta Ads Library search URL.
 * Supports multiple countries and active ads only.
 */
function buildUrl({ query, country = 'US', mediaType = 'all', adType = 'all' }) {
  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: adType,
    country: country.toUpperCase(),
    media_type: mediaType,
    q: query,
    search_type: 'keyword_unordered',
  });
  return `${BASE}?${params.toString()}`;
}

async function autoScroll(page, maxScrolls) {
  let prevHeight = 0;
  for (let i = 0; i < maxScrolls; i++) {
    const newHeight = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return document.body.scrollHeight;
    });
    // FIX (Bug 4): Increased settle time so lazy-loaded images finish loading
    await page.waitForTimeout(2500);
    if (newHeight === prevHeight) break;
    prevHeight = newHeight;
  }
  // FIX (Bug 4): Final wait after last scroll for any remaining image hydration
  await page.waitForTimeout(2000);
}

/**
 * Extracts ad cards from the rendered page. Runs entirely inside the browser.
 * Multiple fallback strategies because Meta rotates DOM frequently.
 */
async function extractAds(page, hardLimit) {
  return page.evaluate((HARD_LIMIT) => {
    // ─────────────────────────────────────────────────────────────────────────
    // FIX (Bug 1 — CRITICAL): cleanMediaUrl MUST be declared first, before any
    // call site. Previously it was defined inside the for-loop body AFTER the
    // .map(cleanMediaUrl) calls, so it was undefined when those ran, causing a
    // runtime error that silently swallowed all image extraction results.
    // FIX (Bug 2): Keep oh/oe — they are Meta CDN auth tokens. Removing them
    // causes 403s. Only strip pure tracking params that don't affect delivery.
    // ─────────────────────────────────────────────────────────────────────────
    function cleanMediaUrl(url) {
      if (!url) return '';
      try {
        const u = new URL(url);
        // Strip only pure analytics params — do NOT remove oh/oe (CDN auth)
        u.searchParams.delete('_nc_cat');
        u.searchParams.delete('_nc_ohc');
        u.searchParams.delete('ccb');
        // Keep: oh, oe, _nc_sid, _nc_hash, stp, fbid — all required for CDN auth
        return u.toString();
      } catch (_) {
        return url;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FIX (Bug 3): Removed static.xx.fbcdn from the exclusion list.
    // static.xx.fbcdn.net is Meta's primary ad creative CDN. The old filter
    // was silently dropping legitimate ad images.
    // Only exclude known non-content asset paths (/rsrc.php, /emoji.php).
    // ─────────────────────────────────────────────────────────────────────────
    function isAdImage(src) {
      if (!src) return false;
      if (src.startsWith('data:') || src.startsWith('blob:')) return false;
      if (!/scontent|fbcdn|cdninstagram|fbexternal/i.test(src)) return false;
      // Exclude UI chrome assets only (not CDN domain wholesale)
      if (/\/rsrc\.php|\/emoji\.php|\/favicon/i.test(src)) return false;
      return true;
    }

    const out = [];
    const seen = new Set();

    // Strategy 1: identify cards by the visible "Library ID:" marker (most stable signal)
    const allNodes = Array.from(document.querySelectorAll('div'));

    // FIX (Bug 5): Select the INNERMOST node containing "Library ID:" to avoid
    // selecting large parent containers that inflate text length and cause
    // incorrect card boundaries (which skewed results toward large advertisers
    // like Amazon/Temu who have very large card footprints).
    const allCandidates = allNodes.filter((n) => {
      const t = (n.innerText || '').trim();
      return /Library ID:\s*\d+/i.test(t) && t.length < 4000 && n.querySelector('img,video');
    });

    // Keep only innermost: discard any node whose child is also a candidate
    const candidateSet = new Set(allCandidates);
    const candidates = allCandidates.filter(
      (n) => !Array.from(n.querySelectorAll('div')).some((child) => candidateSet.has(child))
    );

    for (const card of candidates) {
      if (out.length >= HARD_LIMIT) break;
      const text = card.innerText || '';
      const idMatch = text.match(/Library ID:\s*(\d+)/i);
      if (!idMatch) continue;
      const adId = idMatch[1];
      if (seen.has(adId)) continue;
      seen.add(adId);

      // Page / advertiser name
      let pageName = '';
      let pageUrl = '';
      let pageId = '';
      const links = card.querySelectorAll('a[role="link"], a[href*="facebook.com"]');
      for (const a of links) {
        const t = (a.innerText || '').trim();
        const h = a.href || '';
        if (t && !pageName && !/Library ID/i.test(t) && t.length < 80 && /facebook\.com\//.test(h)) {
          pageName = t;
          pageUrl = h;
          const pageIdMatch = h.match(/\/(\d{6,})(?:\/|$|\?)/);
          if (pageIdMatch) pageId = pageIdMatch[1];
          break;
        }
      }

      // Meta Ads Library link
      let metaAdsLibraryUrl = '';
      if (adId) {
        metaAdsLibraryUrl = `https://www.facebook.com/ads/library/?id=${adId}`;
      } else if (pageId) {
        metaAdsLibraryUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${pageId}&search_type=page&media_type=all`;
      }

      // Start date
      const startMatch = text.match(/Started running on\s+([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4})/i);
      const startDate = startMatch ? startMatch[1] : null;

      // Active status
      const isActive = /\bActive\b/i.test(text) && !/Inactive/i.test(text.split('Library ID')[0] || '');

      // Platforms
      const platforms = [];
      ['Facebook', 'Instagram', 'Messenger', 'Audience Network', 'Threads'].forEach((p) => {
        if (new RegExp('\\b' + p + '\\b').test(text)) platforms.push(p);
      });

      // CTA
      let cta = '';
      const ctaCandidates = card.querySelectorAll('div[role="button"], a[role="button"]');
      for (const b of ctaCandidates) {
        const t = (b.innerText || '').trim();
        if (
          t &&
          t.length < 30 &&
          /^(Shop Now|Learn More|Sign Up|Get Offer|Order Now|Download|Subscribe|Book Now|Apply Now|Get Quote|Contact Us|See Menu|Watch More|Send Message|Listen Now|Install Now|Play Game|Use App|Buy Now)$/i.test(t)
        ) {
          cta = t;
          break;
        }
      }

      // Landing URL
      let landingUrl = '';
      const allAnchors = card.querySelectorAll('a[href]');
      for (const a of allAnchors) {
        const h = a.href || '';
        if (h && !/facebook\.com/i.test(h) && !/^javascript:/i.test(h) && /^https?:\/\//i.test(h)) {
          landingUrl = h;
          break;
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // MEDIA EXTRACTION
      // cleanMediaUrl and isAdImage are now defined above the loop (Bug 1 fix).
      // ───────────────────────────────────────────────────────────────────────

      // Strategy 1: Direct img tags — check all src variants including currentSrc
      const imgs = Array.from(card.querySelectorAll('img'))
        .flatMap((i) => [
          i.currentSrc,        // highest priority: what the browser actually loaded
          i.src,
          i.getAttribute('src'),
          i.getAttribute('data-src'),
          i.getAttribute('data-img-src'),
          i.getAttribute('data-lazy-src'),
        ])
        .filter(isAdImage)
        .map(cleanMediaUrl);

      // Strategy 2: Background images from inline styles
      const bgImages = Array.from(card.querySelectorAll('[style*="background-image"], [style*="background:"]'))
        .map((el) => {
          const style = el.getAttribute('style') || '';
          const match = style.match(/url\(['"]?([^'"()]+)['"]?\)/);
          return match && match[1] ? match[1] : null;
        })
        .filter(isAdImage)
        .map(cleanMediaUrl);

      // Strategy 3: Picture/source srcset
      const pictureImages = Array.from(card.querySelectorAll('picture source[srcset], source[srcset]'))
        .flatMap((source) => {
          const srcset = source.getAttribute('srcset') || '';
          // Pick the highest-resolution candidate from srcset
          return srcset
            .split(',')
            .map((s) => s.trim().split(' ')[0])
            .filter(Boolean);
        })
        .filter(isAdImage)
        .map(cleanMediaUrl);

      // Strategy 4: Data attributes
      const dataImages = Array.from(
        card.querySelectorAll('[data-src], [data-img], [data-image-url], [data-lazy-src]')
      )
        .map(
          (el) =>
            el.getAttribute('data-src') ||
            el.getAttribute('data-img') ||
            el.getAttribute('data-image-url') ||
            el.getAttribute('data-lazy-src')
        )
        .filter(isAdImage)
        .map(cleanMediaUrl);

      // Strategy 5: CSS computed style background-image (catches dynamically set styles)
      const computedBgImages = Array.from(card.querySelectorAll('div, span'))
        .map((el) => {
          try {
            const bg = window.getComputedStyle(el).backgroundImage;
            if (!bg || bg === 'none') return null;
            const match = bg.match(/url\(['"]?([^'"()]+)['"]?\)/);
            return match ? match[1] : null;
          } catch (_) {
            return null;
          }
        })
        .filter(isAdImage)
        .map(cleanMediaUrl);

      // Merge and deduplicate — prioritise direct img sources
      const allImages = [...imgs, ...bgImages, ...pictureImages, ...dataImages, ...computedBgImages];
      const uniqueImages = [...new Set(allImages)].filter(Boolean);

      // Video extraction
      const videos = Array.from(card.querySelectorAll('video'))
        .map((v) => {
          const src =
            v.currentSrc ||
            v.src ||
            v.getAttribute('src') ||
            v.getAttribute('data-video-src') ||
            (v.querySelector('source') || {}).src ||
            '';
          const poster =
            v.poster ||
            v.getAttribute('poster') ||
            v.getAttribute('data-poster') ||
            '';
          return {
            src: src ? cleanMediaUrl(src) : '',
            poster: poster ? cleanMediaUrl(poster) : '',
          };
        })
        .filter((v) => v.src || v.poster);

      // Data-attribute video elements
      Array.from(card.querySelectorAll('[data-video-url], [data-video-src]')).forEach((el) => {
        const videoUrl = el.getAttribute('data-video-url') || el.getAttribute('data-video-src');
        if (videoUrl && !videos.some((v) => v.src === videoUrl)) {
          videos.push({ src: cleanMediaUrl(videoUrl), poster: '' });
        }
      });

      const videoSrc = videos[0]?.src || '';
      const videoPoster = videos[0]?.poster || uniqueImages[0] || '';

      // Ad copy
      const blocks = Array.from(card.querySelectorAll('div, span, p'))
        .map((n) => (n.innerText || '').trim())
        .filter(
          (t) =>
            t.length > 40 &&
            t.length < 1200 &&
            !/Library ID:/i.test(t) &&
            !/Started running on/i.test(t) &&
            !/Platforms?$/i.test(t)
        )
        .sort((a, b) => b.length - a.length);
      const adCopy = blocks[0] || '';

      // Headline
      let headline = '';
      const headlineCandidates = Array.from(card.querySelectorAll('div, span, h2, h3'))
        .map((n) => (n.innerText || '').trim())
        .filter(
          (t) => t && t.length > 4 && t.length < 120 && t !== pageName && t !== cta && !/Library ID/i.test(t)
        );
      if (headlineCandidates.length) headline = headlineCandidates[0];

      out.push({
        adId,
        pageName,
        pageUrl,
        pageId,
        metaAdsLibraryUrl,
        adCopy,
        headline,
        cta,
        landingUrl,
        imageUrl: uniqueImages[0] || videoPoster || '',
        imageUrls: uniqueImages.slice(0, 6),
        videoUrl: videoSrc,
        videoPoster,
        mediaType: videoSrc ? 'video' : uniqueImages.length ? 'image' : 'unknown',
        platforms,
        isActive,
        startDate,
      });
    }

    return out;
  }, hardLimit);
}

/**
 * Public API.
 */
async function scrape({ query, country = 'US', limit, mediaType = 'all', adType = 'all' }) {
  const finalCountry = (country || 'US').toUpperCase();
  const finalLimit = Math.min(
    Math.max(parseInt(limit, 10) || config.scraper.defaultLimit, 1),
    config.scraper.maxLimit
  );
  const url = buildUrl({ query, country: finalCountry, mediaType, adType });
  log.info('[scrape] starting', { query, country: finalCountry, limit: finalLimit });

  const started = Date.now();
  const ads = await withPage(async (page) => {
    page.setDefaultNavigationTimeout(config.scraper.navigationTimeoutMs);

    // FIX (Bug 4): Use networkidle instead of domcontentloaded so React hydration
    // and initial image loads complete before we start extracting.
    await page.goto(url, { waitUntil: 'networkidle', timeout: config.scraper.navigationTimeoutMs });

    // Dismiss cookie/login dialogs if any
    try { await page.locator('[aria-label="Allow all cookies"]').click({ timeout: 2500 }); } catch (_) {}
    try { await page.locator('[aria-label="Decline optional cookies"]').click({ timeout: 2500 }); } catch (_) {}
    try { await page.locator('div[role="dialog"] [aria-label="Close"]').click({ timeout: 2500 }); } catch (_) {}

    // Wait for at least one "Library ID" marker
    try {
      await page.waitForFunction(
        () => /Library ID:\s*\d+/.test(document.body.innerText || ''),
        { timeout: 15000 }
      );
    } catch (_) {
      log.warn('[scrape] no Library ID marker found within 15s');
    }

    // FIX (Bug 4): Wait for at least one actual CDN image to appear in DOM
    // before scrolling — confirms the page has hydrated image sources.
    try {
      await page.waitForSelector('img[src*="fbcdn"], img[src*="scontent"]', { timeout: 8000 });
    } catch (_) {
      log.warn('[scrape] no fbcdn images found after hydration wait — images may be missing');
    }

    await autoScroll(page, config.scraper.maxScrolls);
    return extractAds(page, finalLimit);
  });

  const elapsedMs = Date.now() - started;
  log.info('[scrape] done', { count: ads.length, elapsedMs });
  return { ads, meta: { query, country: finalCountry, limit: finalLimit, count: ads.length, elapsedMs, url } };
}

/**
 * Scrape a specific advertiser by view_all_page_id (Facebook Page ID).
 */
async function scrapeAdvertiser({ pageId, limit, country = 'US' }) {
  const finalLimit = Math.min(
    Math.max(parseInt(limit, 10) || config.scraper.defaultLimit, 1),
    config.scraper.maxLimit
  );
  const finalCountry = (country || 'US').toUpperCase();
  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country: finalCountry,
    view_all_page_id: pageId,
    search_type: 'page',
    media_type: 'all',
  });
  const url = `${BASE}?${params.toString()}`;
  log.info('[scrape-advertiser] starting', { pageId, country: finalCountry, limit: finalLimit });

  const started = Date.now();
  const ads = await withPage(async (page) => {
    page.setDefaultNavigationTimeout(config.scraper.navigationTimeoutMs);
    await page.goto(url, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(
        () => /Library ID:\s*\d+/.test(document.body.innerText || ''),
        { timeout: 15000 }
      );
    } catch (_) {}
    try {
      await page.waitForSelector('img[src*="fbcdn"], img[src*="scontent"]', { timeout: 8000 });
    } catch (_) {}
    await autoScroll(page, config.scraper.maxScrolls);
    return extractAds(page, finalLimit);
  });

  return {
    ads,
    meta: { pageId, country: finalCountry, limit: finalLimit, count: ads.length, elapsedMs: Date.now() - started, url },
  };
}

module.exports = { scrape, scrapeAdvertiser, buildUrl };
