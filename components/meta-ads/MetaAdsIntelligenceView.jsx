'use client';

// =============================================================================
// Meta Ads Intelligence dashboard — premium SaaS UI inspired by Minea / AdSpy.
// Mounted from MainApp when view === 'meta-ads'.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Search, Bookmark, BookmarkCheck, Loader2, RefreshCw, ExternalLink,
  ChevronDown, Filter, X, TrendingUp, Flame, Sparkles, Brain, MessageCircle,
  Eye, PlayCircle, Image as ImageIcon, Globe2, AlertTriangle, Plus, Trash2,
  Layers, Activity, Users, Clock, CheckCircle2, Wifi, WifiOff, Copy,
} from 'lucide-react';

const cn = (...a) => a.filter(Boolean).join(' ');

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',         icon: Activity },
  { id: 'trending',   label: 'Trending Ads',       icon: TrendingUp },
  { id: 'winners',    label: 'Winning Creatives',  icon: Flame },
  { id: 'competitor', label: 'Competitor Analysis', icon: Users },
  { id: 'insights',   label: 'AI Insights',        icon: Brain },
  { id: 'saved',      label: 'Saved Ads',          icon: Bookmark },
  { id: 'chat',       label: 'Ad Strategist Chat', icon: MessageCircle },
];

const NICHE_SUGGESTIONS = [
  'skincare', 'supplements', 'fitness', 'apparel', 'jewelry',
  'pet products', 'home decor', 'cookware', 'gaming', 'beauty',
];

const COUNTRIES = [
  { code: 'US', name: 'USA', flag: '🇺🇸' },
  { code: 'GB', name: 'UK', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
];

// Validate media URL helper
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return /^https?:$/i.test(u.protocol) && (
      /\.(jpg|jpeg|png|webp|gif)/i.test(u.pathname) ||
      /\.(mp4|webm|mov)/i.test(u.pathname) ||
      /scontent|fbcdn|cdninstagram/i.test(u.hostname)
    );
  } catch (_) {
    return false;
  }
}

function useApi(apiFetch) {
  return useMemo(() => ({
    health:        () => apiFetch('/api/intel/health').then(r => r.json()),
    search:        ({ q, limit = 30, media = 'all', country = 'US' }) =>
      apiFetch(`/api/intel/ads?q=${encodeURIComponent(q)}&limit=${limit}&media=${media}&country=${country}`).then(r => r.json()),
    advertiser:    (pageId, limit = 30, country = 'US') =>
      apiFetch(`/api/intel/advertiser/${encodeURIComponent(pageId)}?limit=${limit}&country=${country}`).then(r => r.json()),
    savedList:     () => apiFetch('/api/intel/saved-ads').then(r => r.json()),
    saveAd:        (ad, note = '', tags = []) =>
      apiFetch('/api/intel/saved-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad, note, tags }),
      }).then(r => r.json()),
    deleteSaved:   (adId) =>
      apiFetch(`/api/intel/saved-ads/${encodeURIComponent(adId)}`, { method: 'DELETE' }).then(r => r.json()),
    competitorsList: () => apiFetch('/api/intel/competitors').then(r => r.json()),
    addCompetitor:   (data) =>
      apiFetch('/api/intel/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    deleteCompetitor: (id) =>
      apiFetch(`/api/intel/competitors/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => r.json()),
  }), [apiFetch]);
}

// =============================================================================
// Root
// =============================================================================
export default function MetaAdsIntelligenceView({ apiFetch, toast, AgentChat }) {
  const [tab, setTab] = useState('dashboard');
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const api = useApi(apiFetch);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const h = await api.health();
      setHealth(h);
    } catch (e) {
      setHealth({ ok: false, configured: false, error: e?.message });
    } finally {
      setHealthLoading(false);
    }
  }, [api]);

  useEffect(() => { refreshHealth(); }, [refreshHealth]);

  const scraperOnline = !!health?.ok;

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1600px] mx-auto w-full">
      <Header health={health} healthLoading={healthLoading} onRefresh={refreshHealth} />
      <TabBar tab={tab} setTab={setTab} />
      <div className="mt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'dashboard'  && <DashboardTab api={api} toast={toast} health={health} setTab={setTab} />}
            {tab === 'trending'   && <SearchTab api={api} toast={toast} preset="trending" online={scraperOnline} />}
            {tab === 'winners'    && <SearchTab api={api} toast={toast} preset="winners" online={scraperOnline} />}
            {tab === 'competitor' && <CompetitorTab api={api} toast={toast} online={scraperOnline} />}
            {tab === 'insights'   && <InsightsTab api={api} />}
            {tab === 'saved'      && <SavedTab api={api} toast={toast} />}
            {tab === 'chat'       && AgentChat}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// Header + status pill
// =============================================================================
function Header({ health, healthLoading, onRefresh }) {
  const ok = !!health?.ok;
  const configured = health?.configured !== false;
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-blue-400/80 tracking-widest">
          <Target className="w-3.5 h-3.5" />
          META ADS INTELLIGENCE · USA
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          Competitor Ads Library
        </h1>
        <p className="text-sm text-white/50 mt-1 max-w-2xl">
          Real-time scraping of active USA Meta Ads. Discover winning creatives, decode competitor strategy, save your favorites.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-2 transition"
          title="Refresh scraper status"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', healthLoading && 'animate-spin')} />
          Status
        </button>
        <div className={cn(
          'px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 backdrop-blur',
          ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : configured
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        )}>
          {ok ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {ok ? 'Scraper online' : configured ? 'Scraper offline' : 'Scraper not configured'}
        </div>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 border-b border-white/5 -mx-1 px-1 scrollbar-hide">
      {TABS.map(t => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition relative',
              active
                ? 'text-white bg-white/10 border border-white/15'
                : 'text-white/55 hover:text-white hover:bg-white/5 border border-transparent'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
            {active && (
              <motion.div
                layoutId="meta-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Dashboard tab
// =============================================================================
function DashboardTab({ api, toast, health, setTab }) {
  const [stats, setStats] = useState({ saved: 0, competitors: 0 });
  useEffect(() => {
    Promise.all([api.savedList().catch(() => ({})), api.competitorsList().catch(() => ({}))])
      .then(([s, c]) => setStats({
        saved: (s?.saved || []).length,
        competitors: (c?.competitors || []).length,
      }));
  }, [api]);

  const tiles = [
    { label: 'Saved Ads',    value: stats.saved,       icon: Bookmark, color: 'from-blue-500/20 to-cyan-500/10', accent: 'text-blue-300' },
    { label: 'Tracked Brands', value: stats.competitors, icon: Users,    color: 'from-purple-500/20 to-pink-500/10', accent: 'text-purple-300' },
    { label: 'Country',      value: 'USA',             icon: Globe2,   color: 'from-emerald-500/20 to-teal-500/10', accent: 'text-emerald-300' },
    { label: 'Active Ads Only', value: 'ON',           icon: CheckCircle2, color: 'from-amber-500/20 to-orange-500/10', accent: 'text-amber-300' },
  ];

  return (
    <div className="space-y-6">
      {!health?.ok && <OfflineBanner health={health} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(t => (
          <motion.div
            key={t.label}
            whileHover={{ y: -2 }}
            className={cn(
              'glass rounded-2xl p-4 border border-white/10 relative overflow-hidden',
              'bg-gradient-to-br',
              t.color
            )}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-white/50">{t.label}</div>
              <t.icon className={cn('w-4 h-4', t.accent)} />
            </div>
            <div className="mt-2 text-2xl font-semibold">{t.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-blue-300" />
            <h3 className="font-medium">Quick start</h3>
          </div>
          <p className="text-sm text-white/60 mb-3">Pull live USA Meta ads for any niche — results enriched with hook detection, CTA strength, niche classification, and engagement scoring.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {NICHE_SUGGESTIONS.slice(0, 6).map(n => (
              <button key={n} onClick={() => setTab('trending')} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 transition capitalize">
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={() => setTab('trending')}
            className="mt-4 w-full py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 text-sm font-medium hover:from-blue-400 hover:to-cyan-300 transition"
          >
            Start exploring →
          </button>
        </div>
        <div className="glass rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-purple-300" />
            <h3 className="font-medium">How it works</h3>
          </div>
          <ol className="text-sm text-white/60 space-y-2 list-decimal pl-5">
            <li>Search any niche or competitor brand on the <b>Trending</b> or <b>Winning</b> tabs.</li>
            <li>Browse real ad creatives — images, video previews, copy, CTAs, landing URLs.</li>
            <li>Save winners, track competitor brands, and get AI breakdowns in the chat.</li>
            <li>All ads are live, USA-only, sourced from the public Meta Ads Library.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function OfflineBanner({ health }) {
  const configured = health?.configured !== false;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 flex-shrink-0" />
      <div className="text-sm">
        <div className="font-medium text-amber-200">
          {configured ? 'Scraper VPS is not responding' : 'Scraper backend not configured'}
        </div>
        <div className="text-white/60 mt-1">
          {configured
            ? 'The Meta Ads Library scraper service is offline or unreachable. Saved ads and tracked brands still work — live search will resume once the VPS is back online.'
            : 'Set NEXT_PUBLIC_API_URL (and METAADS_SCRAPER_API_KEY) in your Vercel environment variables to enable live ad scraping. See metaads-scraper/README.md for VPS setup.'}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Search-based tab (Trending Ads / Winning Creatives reuse this)
// =============================================================================
function SearchTab({ api, toast, preset, online }) {
  const [query, setQuery] = useState(preset === 'winners' ? 'skincare' : 'fashion');
  const [country, setCountry] = useState('US');
  const [media, setMedia] = useState('all');
  const [limit, setLimit] = useState(30);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState(preset === 'winners' ? 'engagement' : 'recent');
  const [filterCta, setFilterCta] = useState('all');
  const [savedSet, setSavedSet] = useState(new Set());
  const [modal, setModal] = useState(null);

  const refreshSaved = useCallback(async () => {
    try {
      const r = await api.savedList();
      setSavedSet(new Set((r?.saved || []).map(s => s.adId)));
    } catch (_) {}
  }, [api]);

  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  const runSearch = useCallback(async (q = query, c = country) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.search({ q: q.trim(), limit, media, country: c });
      if (r?.offline || !r?.ok) {
        setError(r?.error || 'Scraper offline');
        setAds([]);
        setMeta(null);
      } else {
        setAds(Array.isArray(r?.ads) ? r.ads : []);
        setMeta(r?.meta || null);
      }
    } catch (e) {
      setError(e?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [api, query, country, limit, media]);

  useEffect(() => {
    if (online) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedFiltered = useMemo(() => {
    let list = ads.slice();
    if (filterCta !== 'all') list = list.filter(a => (a.cta || '').toLowerCase() === filterCta.toLowerCase());
    if (sortBy === 'engagement') list.sort((a, b) => (b.enrichment?.engagementScore || 0) - (a.enrichment?.engagementScore || 0));
    else if (sortBy === 'recent') list.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
    else if (sortBy === 'cta') list.sort((a, b) => (b.enrichment?.ctaStrength || 0) - (a.enrichment?.ctaStrength || 0));
    else if (sortBy === 'ecommerce') list.sort((a, b) => (b.enrichment?.ecommerceScore || 0) - (a.enrichment?.ecommerceScore || 0));
    return list;
  }, [ads, filterCta, sortBy]);

  const onSave = useCallback(async (ad) => {
    try {
      if (savedSet.has(ad.adId)) {
        await api.deleteSaved(ad.adId);
        setSavedSet(s => { const n = new Set(s); n.delete(ad.adId); return n; });
        toast?.({ type: 'info', message: 'Removed from saved' });
      } else {
        await api.saveAd(ad);
        setSavedSet(s => new Set(s).add(ad.adId));
        toast?.({ type: 'success', message: 'Saved to library' });
      }
    } catch (e) {
      toast?.({ type: 'error', message: 'Save failed: ' + e?.message });
    }
  }, [api, savedSet, toast]);

  const ctaOptions = useMemo(() => {
    const s = new Set(ads.map(a => a.cta).filter(Boolean));
    return ['all', ...Array.from(s)];
  }, [ads]);

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];

  return (
    <div className="space-y-4">
      <FilterBar
        query={query} setQuery={setQuery}
        country={country} setCountry={setCountry}
        media={media} setMedia={setMedia}
        limit={limit} setLimit={setLimit}
        sortBy={sortBy} setSortBy={setSortBy}
        filterCta={filterCta} setFilterCta={setFilterCta}
        ctaOptions={ctaOptions}
        onSearch={() => runSearch(query, country)}
        loading={loading}
        online={online}
        selectedCountry={selectedCountry}
      />
      {meta && !error && (
        <div className="text-xs text-white/40 flex items-center gap-3 flex-wrap">
          <span>{selectedCountry.flag} {selectedCountry.name}</span>
          <span>·</span>
          <span>{sortedFiltered.length} ads</span>
          <span>·</span>
          <span>Active only</span>
          <span>·</span>
          <span>Query: "{meta.query}"</span>
          {meta.elapsedMs && (
            <>
              <span>·</span>
              <span>Took {Math.round((meta.elapsedMs || 0) / 1000)}s</span>
            </>
          )}
        </div>
      )}

      {error && <InlineError error={error} />}

      {loading ? (
        <SkeletonGrid />
      ) : sortedFiltered.length === 0 && !error ? (
        <EmptyState online={online} onRetry={() => runSearch()} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedFiltered.map((ad, i) => (
            <AdCard
              key={ad.adId || i}
              ad={ad}
              saved={savedSet.has(ad.adId)}
              onSave={() => onSave(ad)}
              onOpen={() => setModal(ad)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal && <AdModal ad={modal} onClose={() => setModal(null)} onSave={() => onSave(modal)} saved={savedSet.has(modal.adId)} />}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// FilterBar / Search
// =============================================================================
function FilterBar({
  query, setQuery, country, setCountry, media, setMedia, limit, setLimit, sortBy, setSortBy,
  filterCta, setFilterCta, ctaOptions, onSearch, loading, online, selectedCountry,
}) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-3 md:p-4 flex flex-col gap-3">
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="Search Meta ads by keyword, brand or product…"
            className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-400/50 placeholder-white/30"
          />
        </div>
        <button
          onClick={() => onSearch()}
          disabled={loading || !online}
          className={cn(
            'px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition',
            online && !loading
              ? 'bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300'
              : 'bg-white/5 text-white/40 cursor-not-allowed'
          )}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? 'Scraping…' : 'Search'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="text-white/40 flex items-center gap-1"><Filter className="w-3 h-3" /> Filters:</span>
        <CountrySelect value={country} onChange={setCountry} selectedCountry={selectedCountry} />
        <Select label="Media" value={media} onChange={setMedia} options={[{ v: 'all', l: 'All media' }, { v: 'video', l: 'Video only' }, { v: 'image', l: 'Image only' }]} />
        <Select label="Sort" value={sortBy} onChange={setSortBy} options={[
          { v: 'ecommerce', l: 'Top ecommerce' },
          { v: 'engagement', l: 'Top engagement' },
          { v: 'recent', l: 'Most recent' },
          { v: 'cta', l: 'Strongest CTA' },
        ]} />
        <Select label="CTA" value={filterCta} onChange={setFilterCta} options={ctaOptions.map(o => ({ v: o, l: o === 'all' ? 'All CTAs' : o }))} />
        <Select label="Limit" value={String(limit)} onChange={(v) => setLimit(parseInt(v, 10) || 30)} options={[{ v: '20', l: '20' }, { v: '30', l: '30' }, { v: '50', l: '50' }, { v: '80', l: '80' }]} />
      </div>
    </div>
  );
}

function CountrySelect({ value, onChange, selectedCountry }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="px-2.5 py-1 rounded-md border border-white/10 bg-black/40 text-white/80 text-[11px] font-medium flex items-center gap-1.5 hover:bg-black/60 transition"
      >
        <Globe2 className="w-3 h-3" />
        <span className="hidden sm:inline">{selectedCountry.flag} {selectedCountry.name}</span>
        <span className="sm:hidden">{selectedCountry.flag}</span>
        <ChevronDown className={cn('w-3 h-3 transition', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-full mt-1 left-0 z-10 glass border border-white/10 rounded-lg p-1 min-w-[140px] shadow-xl"
          >
            {COUNTRIES.map(c => (
              <button
                key={c.code}
                onClick={() => { onChange(c.code); setOpen(false); }}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-white/5 flex items-center gap-2 transition',
                  c.code === value && 'bg-blue-500/15 text-blue-300'
                )}
              >
                <span>{c.flag}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({ label, frozen }) {
  return (
    <span className={cn(
      'px-2.5 py-1 rounded-md border text-[11px] font-medium',
      frozen ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' : 'bg-white/5 border-white/10 text-white/70'
    )}>
      {label}
    </span>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="relative flex items-center gap-1.5">
      <span className="text-white/40">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-black/40 border border-white/10 rounded-md text-white/80 text-[11px] px-2 py-1 pr-6 focus:outline-none focus:border-blue-400/50 appearance-none"
      >
        {options.map(o => <option key={o.v} value={o.v} className="bg-[#0a0a0f]">{o.l}</option>)}
      </select>
      <ChevronDown className="w-3 h-3 text-white/40 absolute right-1 pointer-events-none" />
    </label>
  );
}

// =============================================================================
// AdCard with improved media rendering
// =============================================================================
function AdCard({ ad, saved, onSave, onOpen }) {
  const [hover, setHover] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef(null);

  const isVideo = ad.mediaType === 'video' && (ad.videoUrl || ad.videoPoster);
  const poster = ad.videoPoster || ad.imageUrl || (ad.imageUrls && ad.imageUrls[0]);
  const showVideo = isVideo && hover && ad.videoUrl && isValidMediaUrl(ad.videoUrl);
  const score = ad?.enrichment?.engagementScore;
  const ecomScore = ad?.enrichment?.ecommerceScore;
  const hookTypes = ad?.enrichment?.hookTypes || [];
  const emotionalTriggers = ad?.enrichment?.emotionalTriggers || [];
  const niche = ad?.enrichment?.niche;
  const isUgc = ad?.enrichment?.isUgc;
  const brandType = ad?.enrichment?.brandType;

  // Lazy load image using Intersection Observer
  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.target.dataset.src) {
            entry.target.src = entry.target.dataset.src;
            entry.target.removeAttribute('data-src');
          }
        });
      },
      { rootMargin: '50px' }
    );
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  const handleImageError = () => {
    if (retryCount < 2 && poster) {
      // Retry loading with cache-busting param
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setImageError(false);
      }, 500);
    } else {
      setImageError(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="glass rounded-2xl border border-white/10 overflow-hidden group flex flex-col cursor-pointer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
    >
      <div className="relative aspect-[4/5] bg-black/60 overflow-hidden">
        {showVideo && isValidMediaUrl(ad.videoUrl) ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video 
            src={ad.videoUrl} 
            poster={poster && isValidMediaUrl(poster) ? poster : undefined} 
            autoPlay 
            muted 
            loop 
            playsInline 
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : poster && isValidMediaUrl(poster) && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
            ref={imgRef}
            data-src={poster}
            alt={ad.headline || ad.pageName} 
            loading="lazy" 
            className="w-full h-full object-cover transition-opacity duration-300" 
            crossOrigin="anonymous"
            onError={handleImageError}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-2">
            <ImageIcon className="w-8 h-8" />
            {imageError && <div className="text-[10px] text-center px-2">Media unavailable</div>}
          </div>
        )}
        {/* badges */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5">
          {isVideo && (
            <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] flex items-center gap-1">
              <PlayCircle className="w-3 h-3" /> Video
            </span>
          )}
          {ad.isActive && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] backdrop-blur">
              Active
            </span>
          )}
          {typeof score === 'number' && score >= 75 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] backdrop-blur flex items-center gap-1">
              <Flame className="w-3 h-3" /> Hot
            </span>
          )}
          {isUgc && (
            <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] backdrop-blur">
              UGC
            </span>
          )}
          {brandType === 'shopify-dtc' && (
            <span className="px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] backdrop-blur">
              Shopify
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className={cn(
              'p-1.5 rounded-md backdrop-blur-md border transition',
              saved
                ? 'bg-blue-500/30 border-blue-400/50 text-blue-200'
                : 'bg-black/60 border-white/15 text-white/70 hover:text-white hover:bg-black/80'
            )}
            title={saved ? 'Remove from saved' : 'Save ad'}
          >
            {saved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
          </button>
        </div>
        {(typeof score === 'number' || typeof ecomScore === 'number') && (
          <div className="absolute bottom-2 right-2 flex gap-1">
            {typeof ecomScore === 'number' && ecomScore >= 60 && (
              <div className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 backdrop-blur text-[10px] font-mono text-emerald-200">
                DTC {ecomScore}
              </div>
            )}
            {typeof score === 'number' && (
              <div className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-mono">
                {score}/100
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 flex-shrink-0 flex items-center justify-center text-[10px] font-medium">
            {(ad.pageName || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="text-xs font-medium truncate">{ad.pageName || 'Unknown advertiser'}</div>
        </div>
        <div className="text-xs text-white/60 line-clamp-3 leading-snug">
          {ad.adCopy || ad.headline || '(no ad copy detected)'}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
          {ad.cta && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-300">
              {ad.cta}
            </span>
          )}
          {niche && niche !== 'general' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-white/60 capitalize">
              {niche}
            </span>
          )}
          {hookTypes.slice(0, 1).map(h => (
            <span key={h} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 border border-purple-500/30 text-purple-300">
              {h}
            </span>
          ))}
          {emotionalTriggers.slice(0, 1).map(t => (
            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-300">
              {t}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// AdModal with enhanced insights
// =============================================================================
function AdModal({ ad, onClose, onSave, saved }) {
  const isVideo = ad.mediaType === 'video' && ad.videoUrl && isValidMediaUrl(ad.videoUrl);
  const poster = ad.videoPoster || ad.imageUrl || (ad.imageUrls && ad.imageUrls[0]);
  const validPoster = poster && isValidMediaUrl(poster) ? poster : undefined;

  const copy = useCallback((text) => {
    try { navigator.clipboard.writeText(String(text || '')); } catch (_) {}
  }, []);

  const enrichment = ad?.enrichment || {};
  const hasEnrichment = Object.keys(enrichment).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        className="glass border border-white/10 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:w-1/2 bg-black/70 flex items-center justify-center overflow-hidden">
          {isVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={ad.videoUrl} poster={validPoster} controls autoPlay className="w-full max-h-[80vh] object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : validPoster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={validPoster} alt="ad creative" className="w-full max-h-[80vh] object-contain" crossOrigin="anonymous" onError={(e) => { e.currentTarget.style.opacity = '0.3'; }} />
          ) : (
            <div className="p-12 text-white/30 flex flex-col items-center gap-2">
              <ImageIcon className="w-10 h-10" />
              <div className="text-xs">Media unavailable</div>
            </div>
          )}
        </div>
        <div className="md:w-1/2 p-5 overflow-y-auto flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 flex-shrink-0 flex items-center justify-center text-xs font-medium">
                {(ad.pageName || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{ad.pageName || 'Unknown advertiser'}</div>
                <div className="text-[11px] text-white/50 truncate">Library ID: {ad.adId}</div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ad.isActive && <Chip className="bg-emerald-500/20 border-emerald-500/30 text-emerald-300">Active</Chip>}
            {ad.mediaType === 'video' && <Chip className="bg-purple-500/20 border-purple-500/30 text-purple-300"><PlayCircle className="w-3 h-3" /> Video</Chip>}
            {ad.cta && <Chip className="bg-blue-500/20 border-blue-500/30 text-blue-300">{ad.cta}</Chip>}
            {enrichment.isUgc && <Chip className="bg-purple-500/20 border-purple-500/30 text-purple-300">UGC Style</Chip>}
            {enrichment.isShopify && <Chip className="bg-blue-500/20 border-blue-500/30 text-blue-300">Shopify</Chip>}
            {enrichment.brandType === 'dtc-ecommerce' && <Chip className="bg-emerald-500/20 border-emerald-500/30 text-emerald-300">DTC Brand</Chip>}
            {enrichment.niche && enrichment.niche !== 'general' && (
              <Chip className="bg-white/5 border-white/10 capitalize">{enrichment.niche}</Chip>
            )}
            {ad.platforms?.map(p => (
              <Chip key={p} className="bg-white/5 border-white/10">{p}</Chip>
            ))}
            {ad.startDate && (
              <Chip className="bg-white/5 border-white/10 text-white/60"><Clock className="w-3 h-3" /> {ad.startDate}</Chip>
            )}
          </div>

          {hasEnrichment && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {typeof enrichment.engagementScore === 'number' && (
                  <Metric label="Engagement" value={`${enrichment.engagementScore}/100`} accent="text-blue-300" />
                )}
                {typeof enrichment.ecommerceScore === 'number' && (
                  <Metric label="Ecom Score" value={`${enrichment.ecommerceScore}/100`} accent="text-emerald-300" />
                )}
                {typeof enrichment.ctaStrength === 'number' && (
                  <Metric label="CTA" value={`${enrichment.ctaStrength}/10`} accent="text-cyan-300" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {typeof enrichment.urgencyScore === 'number' && enrichment.urgencyScore > 0 && (
                  <Metric label="Urgency" value={`${enrichment.urgencyScore}/5`} accent="text-amber-300" />
                )}
                {typeof enrichment.wordCount === 'number' && (
                  <Metric label="Words" value={enrichment.wordCount} accent="text-white/70" />
                )}
              </div>
            </>
          )}

          {ad.headline && (
            <Section title="Headline" onCopy={() => copy(ad.headline)}>
              <div className="text-sm font-medium">{ad.headline}</div>
            </Section>
          )}
          {ad.adCopy && (
            <Section title="Ad copy" onCopy={() => copy(ad.adCopy)}>
              <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{ad.adCopy}</div>
            </Section>
          )}

          {/* Real-time competitor insights */}
          {enrichment.hookTypes?.length > 0 && (
            <Section title="🎯 Detected Hooks (from real ad)">
              <div className="flex flex-wrap gap-1.5">
                {enrichment.hookTypes.map(h => (
                  <Chip key={h} className="bg-purple-500/15 border-purple-500/30 text-purple-300">{h}</Chip>
                ))}
              </div>
            </Section>
          )}

          {enrichment.emotionalTriggers?.length > 0 && (
            <Section title="💭 Emotional Triggers (from real ad)">
              <div className="flex flex-wrap gap-1.5">
                {enrichment.emotionalTriggers.map(t => (
                  <Chip key={t} className="bg-rose-500/15 border-rose-500/30 text-rose-300">{t}</Chip>
                ))}
              </div>
            </Section>
          )}

          {ad.landingUrl && (
            <Section title="Landing URL" onCopy={() => copy(ad.landingUrl)}>
              <a href={ad.landingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1.5 break-all">
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                {ad.landingUrl}
              </a>
              {enrichment.isShopify && (
                <div className="mt-1 text-[10px] text-emerald-300">✓ Shopify store detected</div>
              )}
              {enrichment.isEnterprise && (
                <div className="mt-1 text-[10px] text-amber-300">⚠ Enterprise marketplace</div>
              )}
            </Section>
          )}

          <div className="flex gap-2 mt-auto pt-2">
            <button
              onClick={onSave}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2',
                saved
                  ? 'bg-blue-500/30 border border-blue-400/40 text-blue-200'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300'
              )}
            >
              {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              {saved ? 'Saved' : 'Save ad'}
            </button>
            {ad.metaAdsLibraryUrl && (
              <a 
                href={ad.metaAdsLibraryUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-1.5 whitespace-nowrap"
                title="Open in Meta Ads Library"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Meta Ads
              </a>
            )}
            {ad.pageUrl && (
              <a 
                href={ad.pageUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-1.5"
                title="View advertiser page"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Page
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
function Chip({ children, className }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-md border text-[10px] font-medium flex items-center gap-1', className)}>
      {children}
    </span>
  );
}
function Metric({ label, value, accent }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={cn('text-sm font-semibold mt-0.5', accent)}>{value}</div>
    </div>
  );
}
function Section({ title, onCopy, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{title}</div>
        {onCopy && (
          <button onClick={onCopy} className="text-white/40 hover:text-white/80 transition" title="Copy">
            <Copy className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// Competitor tab
// =============================================================================
function CompetitorTab({ api, toast, online }) {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [pageId, setPageId] = useState('');
  const [niche, setNiche] = useState('');
  const [loading, setLoading] = useState(false);
  const [adsByPage, setAdsByPage] = useState({});
  const [loadingAds, setLoadingAds] = useState(null);

  const reload = useCallback(async () => {
    try {
      const r = await api.competitorsList();
      setList(r?.competitors || []);
    } catch (_) {}
  }, [api]);

  useEffect(() => { reload(); }, [reload]);

  const add = async () => {
    if (!name.trim() && !pageId.trim()) return;
    setLoading(true);
    try {
      await api.addCompetitor({ name, pageId, niche });
      setName(''); setPageId(''); setNiche('');
      await reload();
      toast?.({ kind: 'success', title: 'Competitor added' });
    } catch (e) {
      toast?.({ kind: 'error', title: 'Add failed', description: e?.message });
    } finally { setLoading(false); }
  };

  const fetchAds = async (c) => {
    if (!c.pageId) {
      toast?.({ kind: 'error', title: 'Page ID required', description: 'Add a numeric Facebook Page ID to scrape this competitor.' });
      return;
    }
    setLoadingAds(c.id);
    try {
      const r = await api.advertiser(c.pageId, 20);
      if (r?.offline || !r?.ok) {
        toast?.({ kind: 'error', title: 'Scraper offline' });
      } else {
        setAdsByPage(prev => ({ ...prev, [c.id]: r.ads || [] }));
      }
    } catch (e) {
      toast?.({ kind: 'error', title: 'Fetch failed', description: e?.message });
    } finally { setLoadingAds(null); }
  };

  const remove = async (id) => {
    try { await api.deleteCompetitor(id); await reload(); } catch (_) {}
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-white/10 p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-300" /> Track a competitor brand
        </h3>
        <div className="grid md:grid-cols-4 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand name (e.g. Glossier)" className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50 placeholder-white/30" />
          <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Facebook Page ID (numeric, optional)" className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50 placeholder-white/30" />
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (e.g. skincare)" className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50 placeholder-white/30" />
          <button onClick={add} disabled={loading} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 text-sm font-medium hover:from-blue-400 hover:to-cyan-300 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        <p className="text-[11px] text-white/40 mt-2">
          Tip: find a brand's Page ID by visiting their Facebook page → About → Page Transparency. Required to pull their ads via the Ads Library.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="glass rounded-2xl border border-white/10 p-8 text-center text-sm text-white/50">
          No competitors tracked yet. Add one above to start pulling their active USA ads.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(c => (
            <div key={c.id} className="glass rounded-2xl border border-white/10 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500/40 to-pink-500/40 flex items-center justify-center text-sm font-medium flex-shrink-0">
                    {(c.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || `Page ${c.pageId}`}</div>
                    <div className="text-[11px] text-white/50 truncate">
                      {c.niche && <span className="capitalize">{c.niche} · </span>}
                      {c.pageId ? `Page ID ${c.pageId}` : 'No page ID set'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchAds(c)} disabled={!online || loadingAds === c.id} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-1.5 disabled:opacity-50">
                    {loadingAds === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Pull ads
                  </button>
                  <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-white/60 hover:text-rose-300 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {adsByPage[c.id] && adsByPage[c.id].length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {adsByPage[c.id].slice(0, 8).map(ad => (
                    <a key={ad.adId} href={ad.landingUrl || '#'} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-black/50 rounded-lg overflow-hidden relative group border border-white/5">
                      {(ad.videoPoster || ad.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ad.videoPoster || ad.imageUrl} alt={ad.headline || ''} loading="lazy" crossOrigin="anonymous" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" onError={(e) => { e.currentTarget.style.opacity = '0.2'; }} />
                      ) : <div className="flex items-center justify-center h-full text-white/30"><ImageIcon className="w-6 h-6" /></div>}
                      {ad.mediaType === 'video' && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] flex items-center gap-1">
                          <PlayCircle className="w-2.5 h-2.5" /> Video
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Saved tab
// =============================================================================
function SavedTab({ api, toast }) {
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.savedList();
      setSaved(r?.saved || []);
    } catch (_) {} finally { setLoading(false); }
  }, [api]);
  useEffect(() => { reload(); }, [reload]);

  const remove = async (adId) => {
    try { await api.deleteSaved(adId); await reload(); toast?.({ kind: 'info', title: 'Removed' }); } catch (_) {}
  };

  if (loading) return <SkeletonGrid />;
  if (saved.length === 0) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-10 text-center">
        <Bookmark className="w-8 h-8 mx-auto text-white/30 mb-3" />
        <div className="text-sm text-white/60">You haven't saved any ads yet.</div>
        <div className="text-xs text-white/40 mt-1">Tap the bookmark icon on any ad to save it here.</div>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {saved.map(s => (
          <AdCard
            key={s.adId}
            ad={s.ad}
            saved
            onSave={() => remove(s.adId)}
            onOpen={() => setModal(s.ad)}
          />
        ))}
      </div>
      <AnimatePresence>
        {modal && <AdModal ad={modal} onClose={() => setModal(null)} onSave={() => { remove(modal.adId); setModal(null); }} saved />}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// AI Insights (Phase 1 — placeholder with copy explaining Phase 2 features)
// =============================================================================
function InsightsTab({ api }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-5 h-5 text-purple-300" />
        <h3 className="font-medium">AI Insights — coming in Phase 2</h3>
      </div>
      <p className="text-sm text-white/60 max-w-3xl">
        The AI Insights engine will run deep analysis on your saved ads + tracked competitors and surface:
      </p>
      <ul className="text-sm text-white/60 list-disc pl-5 mt-3 space-y-1.5">
        <li>Top winning hooks across niches with confidence scoring</li>
        <li>Emotional trigger detection (fear, FOMO, aspiration, social proof)</li>
        <li>UGC vs polished creative breakdowns</li>
        <li>Viral probability scoring per ad</li>
        <li>Competitor angle clustering (problem-aware, solution-aware, etc.)</li>
        <li>CTA effectiveness benchmarks</li>
        <li>Weekly trend reports auto-generated from saved data</li>
      </ul>
      <p className="text-xs text-white/40 mt-4">
        Phase 1 already enriches every ad with hook detection, CTA strength, niche classification, and a composite engagement score (visible on every ad card).
      </p>
    </div>
  );
}

// =============================================================================
// Shared UI bits
// =============================================================================
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="aspect-[4/5] bg-white/5 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-1/2 bg-white/10 rounded animate-pulse" />
            <div className="h-2 w-full bg-white/5 rounded animate-pulse" />
            <div className="h-2 w-3/4 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
function InlineError({ error }) {
  return (
    <div className="glass rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-rose-300 mt-0.5 flex-shrink-0" />
      <div className="text-sm text-rose-200">{error}</div>
    </div>
  );
}
function EmptyState({ online, onRetry }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-10 text-center">
      <Layers className="w-8 h-8 mx-auto text-white/30 mb-3" />
      <div className="text-sm text-white/60">
        {online ? 'No ads matched your search. Try a different keyword.' : 'Scraper offline — saved ads and tracked brands still work.'}
      </div>
      {online && (
        <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs">
          Retry search
        </button>
      )}
    </div>
  );
}
