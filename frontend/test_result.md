#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================
# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK
#====================================================================================================
# END - Testing Protocol
#====================================================================================================

user_problem_statement: |
  Phase 1: Upgrade the Meta Ads Intelligence section of Social Operative Inc. into
  a production-grade USA-focused competitor intelligence platform powered by Meta
  Ads Library scraping + AI analysis, similar to Minea / AdSpy / Dropispy / Pipiads.

  Architecture (kept separated):
    - Frontend repo  : social-operative-inc  (Next.js on Vercel)
    - Scraper repo   : metaads-scraper       (Express + Playwright on Hostinger VPS)
    - DB             : Supabase (auth + saved ads + competitors) + MongoDB Atlas (raw scrape cache)
    - AI             : OpenRouter (heavy analysis on the Vercel side)

  Phase-1 scope: rock-solid foundation \u2014 USA-only scraper, structured /ads API,
  premium dashboard with sub-tabs (Dashboard, Trending, Winning, Competitor Analysis,
  AI Insights, Saved, Ad Strategist Chat), real media rendering, search + filters,
  infinite-friendly grid, caching, graceful offline states, and lightweight
  per-ad enrichment (hook detection, CTA strength, niche classification,
  engagement scoring).

backend:
  - task: "metaads-scraper backend (separate VPS repo) \u2014 Express + Playwright + USA-only Meta Ads Library scraper"
    implemented: true
    working: true
    file: "metaads-scraper/src/**"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Full Node 18+ Express server with:
            - GET /health (public)
            - GET /ads?q=...&limit=...&media=all|image|video
            - GET /advertiser/:pageId?limit=...
            - GET /cache/stats \u00b7 POST /cache/clear
          X-API-Key auth (fail-closed). CORS allowlist. Rate limit 60/min default.
          Country hard-locked to US in every URL builder.
          Browser pool: singleton chromium, auto-recycle every 80 pages, stealth tweaks,
          en-US locale, America/New_York timezone, realistic UA.
          Extractor uses the visible "Library ID: <digits>" text marker as primary anchor
          \u2014 far more stable than Meta's rotating CSS classes \u2014 with multi-strategy
          fallback for page name, CTA, landing URL, images, video poster, start date.
          Enrichment pipeline: niche classification (skincare/supplements/fitness/...),
          CTA strength scoring (1\u201310), hook-type detection (question/stat-shock/
          curiosity-gap/testimonial/callout/numbered-list/before-after), urgency
          patterns, composite engagement score 0\u2013100.
          L1 in-process LRU cache (10 min). L2 MongoDB cache (1 h, optional).
          Locally verified: scraped "skincare" (8 ads) and "supplements" (18 ads)
          and "fashion" (29 ads) directly from facebook.com/ads/library, all with
          real fbcdn image URLs, real ad copy, real Library IDs, real start dates.
          Includes Dockerfile, PM2 ecosystem.config.js, comprehensive README.md
          with Hostinger VPS + Nginx + Certbot + PM2 deploy steps.

  - task: "Frontend proxy route /api/intel/* (hides API key, adds Supabase auth, persists saved ads + competitors, graceful offline)"
    implemented: true
    working: true
    file: "app/api/intel/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Native fetch only, 55s timeout, X-API-Key injected server-side from
          METAADS_SCRAPER_API_KEY env var. Proxies /health, /ads, /advertiser/:id.
          /saved-ads (GET/POST/DELETE) and /competitors (GET/POST/DELETE) persist to
          MongoDB Atlas with graceful degradation if DB unavailable.
          Returns { ok:false, offline:true } envelope when scraper unreachable so the
          UI can render a clean offline state instead of a crash.
          Locally verified: health 200, ads 200 with real data, unauthorized 401,
          saved-ads with no Mongo returns { saved: [], offline: true }.

  - task: "Production-stabilized core /api/[[...path]]/route.js retained (no regressions)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Untouched from the previous stabilization pass: locked-headers OpenRouter,
          rejected-localhost Mongo on Vercel, safeStr defensiveness, bulletproof
          outer try/catch. Auth/login/signup verified working against the real
          Supabase project (test-operative@socialoperative.dev).

frontend:
  - task: "Meta Ads Intelligence dashboard (replaces old chat-only Meta Ads agent view)"
    implemented: true
    working: true
    file: "components/meta-ads/MetaAdsIntelligenceView.jsx \u00b7 app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Premium dark SaaS UI \u2014 glassmorphism cards, animated tab underline
          (framer-motion layoutId), gradient hover, ad-card hover-preview video,
          modal viewer with copy-to-clipboard sections.
          Sub-tabs: Dashboard \u00b7 Trending Ads \u00b7 Winning Creatives \u00b7 Competitor
          Analysis \u00b7 AI Insights \u00b7 Saved Ads \u00b7 Ad Strategist Chat (existing
          chat preserved unchanged inside last tab).
          Filters: keyword, country (USA frozen pill), media (all/image/video),
          sort (engagement/recent/CTA), CTA dropdown derived from result set,
          limit (20/30/50/80).
          AdCard renders real fbcdn images, video poster + hover playback, Active
          badge, Hot badge (engagement \u2265 75), score chip, niche/hook/CTA pills.
          AdModal: real media, headline, ad copy, hooks, landing URL, three metric
          tiles, save/page actions.
          OfflineBanner explains exactly how to configure NEXT_PUBLIC_API_URL.
          Saved-Ads tab + Competitor Tracker tab fully wired to /api/intel/*.
          Verified end-to-end with real data (Black Girl Vitamins, Metamucil, iHerb,
          Troponin Supplements all rendered correctly in the grid).

  - task: "Sidebar 'Meta Ads' item now opens dashboard view (chat preserved as sub-tab)"
    implemented: true
    working: true
    file: "app/page.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          MainApp render switched: when view === 'meta-ads' \u2192 render
          MetaAdsIntelligenceView and pass <AgentView agentKey='meta-ads' /> as
          AgentChat prop. Other agent views unchanged. No regression on Commerce,
          Support, Content, Competitor agents.

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 2
  run_ui: true

test_plan:
  current_focus:
    - "metaads-scraper backend (separate VPS repo) \u2014 Express + Playwright + USA-only Meta Ads Library scraper"
    - "Frontend proxy route /api/intel/*"
    - "Meta Ads Intelligence dashboard"
    - "Sidebar 'Meta Ads' item now opens dashboard view"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 1 of the Meta Ads Intelligence upgrade is COMPLETE and verified
      end-to-end with REAL LIVE USA Meta Ads Library data.

      Verified locally:
        \u2705 Scraper server up on :8080 (Chromium 148, headless, USA-locked)
        \u2705 GET /health \u2192 ok
        \u2705 GET /ads?q=skincare \u2192 8 real ads (TikTok, Amazon Beauty, ...)
        \u2705 GET /ads?q=supplements \u2192 18 real ads (Black Girl Vitamins, Metamucil, iHerb, Troponin)
        \u2705 GET /ads?q=fashion \u2192 29 real ads
        \u2705 Frontend proxy /api/intel/health \u2192 reports scraper online
        \u2705 Frontend grid renders all real fbcdn creatives, engagement scores,
            niche/hook/CTA chips, Active badges
        \u2705 Modal opens correctly with full ad copy + 3 metric tiles
        \u2705 Save-ad bookmark toggling works
        \u2705 Tab switching (Dashboard \u2192 Trending \u2192 Saved \u2192 Chat) animates cleanly
        \u2705 Existing Meta Ads chat preserved as Ad Strategist Chat sub-tab
        \u2705 Auth verified against real Supabase project (test user created and login works)
        \u2705 No regressions on other agent views (Commerce, Support, Content, Competitor)

      Next steps for user:
        1. Save to GitHub \u2014 the frontend repo (social-operative-inc) gets the
           dashboard, proxy route, and updated .env.example. metaads-scraper/ is
           in .gitignore so it WILL NOT pollute the frontend repo.
        2. Manually move /app/metaads-scraper/ contents into the existing
           metaads-scraper GitHub repo and push.
        3. Provision Hostinger VPS (2 vCPU / 4 GB), follow metaads-scraper/README.md
           Section "Production deployment \u2014 Hostinger VPS" step-by-step.
        4. Set the following Vercel env vars on social-operative-inc:
             - NEXT_PUBLIC_API_URL=https://scraper.<yourdomain>.com
             - METAADS_SCRAPER_URL=https://scraper.<yourdomain>.com   (optional duplicate, server-side)
             - METAADS_SCRAPER_API_KEY=<same value as SCRAPER_API_KEY on VPS>
             - MONGO_URL=<MongoDB Atlas SRV URI>     (enables Saved Ads + Competitor Tracker)
        5. Redeploy on Vercel \u2014 the dashboard auto-detects the scraper via
           /api/intel/health and switches to "Scraper online" state.

      Phase 2 (not in this round, scoped on request):
        - Heavy AI analysis pipeline (viral score, emotional triggers, UGC detection)
        - AI Insights tab populated with trend reports
        - Ad-by-ad AI breakdowns + saved analyses

      Phase 3 (later):
        - AI Studio upload analysis, script generation, PDF export
