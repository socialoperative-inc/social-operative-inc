'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Target, ShoppingBag, MessageCircle, Sparkles, Search,
  BarChart3, Workflow, Upload, Settings, Bell, ChevronDown, Plus, Send,
  Zap, TrendingUp, Activity, Database, Cpu, Globe, Image as ImageIcon,
  Trash2, Copy, Check, Loader2, Bookmark, Play, Pause, ArrowUpRight,
  Sparkle, Shield, Brain, Rocket, Eye, Command, Mic
} from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart,
  BarChart, Bar, RadialBarChart, RadialBar, PieChart, Pie, Cell
} from 'recharts';

// ============================================================================
// AGENT CONFIG
// ============================================================================
const AGENTS = {
  'meta-ads': {
    id: 'meta-ads',
    name: 'Meta Ads Intelligence',
    short: 'Meta Ads',
    icon: Target,
    color: 'from-blue-500 to-cyan-400',
    accent: '#3b82f6',
    tagline: 'AI marketing strategist for Meta/Facebook/Instagram ads',
    quickPrompts: [
      'Generate 5 viral ad hooks for a premium skincare product targeting women 25-40',
      'Write a high-converting Facebook ad copy for a $97 ebook on AI productivity',
      'Suggest audience targeting and lookalike strategies for a luxury watch brand',
      'Analyze why a CTR of 0.8% is underperforming and recommend 3 fixes',
    ],
  },
  'commerce': {
    id: 'commerce',
    name: 'Commerce Intelligence',
    short: 'Commerce',
    icon: ShoppingBag,
    color: 'from-purple-500 to-pink-400',
    accent: '#a855f7',
    tagline: 'AI-powered e-commerce conversion optimization',
    quickPrompts: [
      'Write a high-converting product description for a wireless noise-cancelling headphone, $249',
      'Generate 3 bundle offer ideas for a coffee brand selling beans, grinder, and mug',
      'Create an SEO-optimized title and bullets for "ergonomic office chair"',
      'Build a 5-email abandoned cart sequence for a fashion DTC brand',
    ],
  },
  'support': {
    id: 'support',
    name: 'Support Operative',
    short: 'Support',
    icon: MessageCircle,
    color: 'from-emerald-500 to-teal-400',
    accent: '#10b981',
    tagline: 'AI customer support and communication specialist',
    quickPrompts: [
      'Customer is angry their order is 5 days late. Write 3 reply variants.',
      'Reply to a COD refusal: customer says "I want to see product before paying"',
      'Draft a refund approval email that keeps the customer loyal',
      'Write a WhatsApp reply to: "Where is my order?? Been 10 days!!"',
    ],
  },
  'content': {
    id: 'content',
    name: 'Content Studio',
    short: 'Content',
    icon: Sparkles,
    color: 'from-amber-500 to-orange-400',
    accent: '#f59e0b',
    tagline: 'AI creative content generation system',
    quickPrompts: [
      'Generate 10 viral Reel hooks for a fitness coach selling a 12-week program',
      'Write a UGC script for a skincare serum highlighting before/after',
      'Create a 7-day content calendar for a sustainable fashion brand',
      'Write 5 Instagram captions in a luxury minimalist tone for a watch launch',
    ],
  },
  'competitor': {
    id: 'competitor',
    name: 'Competitor Intelligence',
    short: 'Competitor',
    icon: Search,
    color: 'from-rose-500 to-red-400',
    accent: '#f43f5e',
    tagline: 'AI competitor research and market intelligence',
    quickPrompts: [
      'Analyze Glossier as a competitor in premium skincare. Give a strategic breakdown.',
      'What angles are winning right now in the supplements niche?',
      'Compare pricing strategies of Allbirds vs Cariuma sneakers',
      'Identify market gaps in the AI productivity tools space',
    ],
  },
};

const MODELS = [
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', tier: 'Fast' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'Premium' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', tier: 'Premium' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', tier: 'Fast' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash', tier: 'Free' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', tier: 'Open' },
];

const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'meta-ads', label: 'Meta Ads Intelligence', icon: Target },
  { id: 'commerce', label: 'Commerce Intelligence', icon: ShoppingBag },
  { id: 'support', label: 'Support Operative', icon: MessageCircle },
  { id: 'content', label: 'Content Studio', icon: Sparkles },
  { id: 'competitor', label: 'Competitor Intelligence', icon: Search },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'uploads', label: 'Upload Center', icon: Upload },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// ============================================================================
// UTILS
// ============================================================================
const cn = (...a) => a.filter(Boolean).join(' ');
const fmt = (n) => new Intl.NumberFormat('en-US').format(n);
const fmtMoney = (n) => '$' + new Intl.NumberFormat('en-US').format(n);

// ============================================================================
// SHARED COMPONENTS
// ============================================================================
function PulseDot({ color = 'bg-emerald-400' }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', color)}></span>
      <span className={cn('relative inline-flex rounded-full h-2 w-2', color)}></span>
    </span>
  );
}

function GradientBorder({ children, className }) {
  return (
    <div className={cn('relative rounded-2xl glass neon-border', className)}>
      {children}
    </div>
  );
}

// ============================================================================
// TOP NAV
// ============================================================================
function TopNav({ onSearch, model, setModel, agentName }) {
  return (
    <div className="h-16 px-6 flex items-center justify-between border-b border-white/5 glass-strong sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-white/70 font-medium flex items-center gap-1.5">
            <Database className="w-3 h-3 text-blue-400" />
            Workspace: <span className="text-white">Acme DTC</span>
            <ChevronDown className="w-3 h-3" />
          </div>
          <div className="text-xs text-white/40 hidden md:block">/ {agentName}</div>
        </div>

        <div className="flex-1 max-w-xl mx-4 relative hidden md:block">
          <div className="relative">
            <Command className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Ask AI anything across your operations..."
              onChange={(e) => onSearch?.(e.target.value)}
              className="w-full pl-9 pr-16 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden md:inline-flex h-5 px-1.5 items-center rounded border border-white/10 text-[10px] text-white/40">⌘K</kbd>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:border-blue-500/50 hidden md:block"
        >
          {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0a10]">{m.label} · {m.tier}</option>)}
        </select>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
          <PulseDot />
          <span className="text-[11px] text-white/70 font-medium">All Systems Operational</span>
        </div>

        <button className="relative p-2 rounded-lg hover:bg-white/5 transition">
          <Bell className="w-4 h-4 text-white/70" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-semibold">
            SO
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR
// ============================================================================
function Sidebar({ active, onChange }) {
  return (
    <aside className="w-64 shrink-0 border-r border-white/5 glass-strong flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="h-16 px-5 flex items-center gap-3 border-b border-white/5">
        <div className="relative">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Sparkle className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a10] pulse-dot"></div>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">Social Operative</div>
          <div className="text-[10px] text-white/40 font-mono tracking-widest">INC. · MISSION CONTROL</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
        <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mb-2 font-semibold">Mission Control</div>
        {SIDEBAR_ITEMS.slice(0, 1).map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
        ))}

        <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mt-5 mb-2 font-semibold">AI Agents</div>
        {SIDEBAR_ITEMS.slice(1, 6).map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
        ))}

        <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mt-5 mb-2 font-semibold">Operations</div>
        {SIDEBAR_ITEMS.slice(6).map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/5">
        <div className="glass rounded-xl p-3 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-3.5 h-3.5 text-blue-400" />
              <div className="text-xs font-semibold">AI Engine</div>
            </div>
            <div className="text-[10px] text-white/50 mb-2">OpenRouter · Multi-model</div>
            <div className="flex items-center justify-between">
              <PulseDot />
              <span className="text-[10px] text-emerald-400 font-mono">ONLINE</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 relative group',
        active ? 'bg-white/5 text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.03]'
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/15 via-purple-500/10 to-transparent border border-blue-500/20"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <Icon className={cn('w-4 h-4 relative z-10', active && 'text-blue-400')} />
      <span className="relative z-10 font-medium">{item.label}</span>
      {active && <div className="ml-auto w-1 h-4 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)] relative z-10"></div>}
    </button>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================
function StatCard({ label, value, delta, icon: Icon, accent, prefix = '', suffix = '' }) {
  const positive = delta >= 0;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="relative glass rounded-xl p-4 overflow-hidden group"
    >
      <div className={cn('absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity', accent)}></div>
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">{label}</div>
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', accent)}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">{prefix}{typeof value === 'number' ? fmt(value) : value}{suffix}</div>
        {delta !== 0 && (
          <div className="flex items-center gap-1 mt-2 text-[11px]">
            <span className={cn('flex items-center gap-0.5 font-semibold', positive ? 'text-emerald-400' : 'text-rose-400')}>
              <TrendingUp className={cn('w-3 h-3', !positive && 'rotate-180')} />
              {positive ? '+' : ''}{delta}%
            </span>
            <span className="text-white/40">vs last period</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================
function DashboardView({ onAgentSelect }) {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/stats');
      const d = await r.json();
      setStats(d);
      setActivity(d.recentActivity || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 10000);
    return () => clearInterval(t);
  }, [loadStats]);

  const m = stats?.metrics;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-2 font-mono">
            <PulseDot />
            <span className="tracking-widest">LIVE · MISSION CONTROL</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, <span className="gradient-text">Operative</span>.
          </h1>
          <p className="text-white/50 text-sm mt-1">Your AI operations are running at peak performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 hover:bg-white/10 transition flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Last 30 days
          </button>
          <button onClick={() => onAgentSelect('meta-ads')} className="px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/30 transition flex items-center gap-2 glow-blue">
            <Rocket className="w-3.5 h-3.5" /> Launch Operation
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {m ? (
          <>
            <StatCard label={m.revenue.label} value={m.revenue.value} delta={m.revenue.delta} icon={TrendingUp} accent="bg-emerald-500" prefix="$" />
            <StatCard label={m.roas.label} value={m.roas.value} delta={m.roas.delta} icon={Zap} accent="bg-blue-500" suffix="x" />
            <StatCard label={m.conversions.label} value={m.conversions.value} delta={m.conversions.delta} icon={Target} accent="bg-purple-500" />
            <StatCard label={m.aiCalls.label} value={m.aiCalls.value} delta={m.aiCalls.delta} icon={Cpu} accent="bg-pink-500" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl shimmer"></div>)
        )}
      </div>

      {/* Revenue chart + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-1">Revenue Intelligence</div>
              <div className="text-lg font-semibold">Revenue vs Spend · 14d</div>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-white/60"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Revenue</span>
              <span className="flex items-center gap-1.5 text-white/60"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Ad Spend</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.revenueSeries || []}>
                <defs>
                  <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <YAxis stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#grad-rev)" />
                <Area type="monotone" dataKey="spend" stroke="#a855f7" strokeWidth={2} fill="url(#grad-spend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-1">AI Activity Stream</div>
              <div className="text-lg font-semibold flex items-center gap-2">Live Operations <PulseDot /></div>
            </div>
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto max-h-64 pr-1">
            {activity.length === 0 ? (
              <div className="text-xs text-white/40 text-center py-8">Waiting for AI operations…</div>
            ) : activity.map((a, i) => (
              <motion.div
                key={a.id || i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/5 transition border border-white/5"
              >
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="w-3.5 h-3.5 text-blue-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-white/90 truncate font-medium">{a.summary || a.type}</div>
                  <div className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono uppercase">{a.agent}</span>
                    <span>·</span>
                    <span>{new Date(a.ts).toLocaleTimeString()}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent triple panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AgentPanel agentKey="meta-ads" onSelect={onAgentSelect}
          metric="ROAS 4.82x" label="Campaigns: 12 active · 3 scaling · 2 winning"
          insight="2 new winning creative angles detected. Recommend scaling top performer +30% budget." />
        <AgentPanel agentKey="commerce" onSelect={onAgentSelect}
          metric="CVR 3.41%" label="142 products · 28 optimized today"
          insight="Product 'Aero Headphones' showing 18% conversion lift after AI title rewrite." />
        <AgentPanel agentKey="support" onSelect={onAgentSelect}
          metric="98% CSAT" label="47 tickets handled · avg 1.2min response"
          insight="Sentiment trending +12% positive. 3 angry escalations resolved by AI." />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">AI Recommendations</div>
            <span className="text-[10px] text-white/40 font-mono">5 NEW</span>
          </div>
          <div className="space-y-2">
            {[
              { icon: TrendingUp, text: 'Scale "Skincare Reel A" creative — projected +$8.2K/wk', color: 'text-emerald-400' },
              { icon: Target, text: 'Audience saturation detected on Campaign 7. Refresh recommended.', color: 'text-amber-400' },
              { icon: ShoppingBag, text: 'Bundle "Headphone + Case" detected 23% AOV uplift potential.', color: 'text-purple-400' },
              { icon: MessageCircle, text: '12 customer questions match FAQ. Enable auto-reply?', color: 'text-blue-400' },
            ].map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/5 transition border border-white/5">
                <r.icon className={cn('w-4 h-4 mt-0.5 shrink-0', r.color)} />
                <div className="text-xs text-white/80 leading-relaxed">{r.text}</div>
                <ArrowUpRight className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" />
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Operational Health</div>
            <PulseDot />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'AI Engine', status: 'OPERATIONAL', value: '99.98%', icon: Brain },
              { label: 'Database', status: 'HEALTHY', value: '8ms', icon: Database },
              { label: 'API Gateway', status: 'ACTIVE', value: '120ms', icon: Globe },
              { label: 'Security', status: 'SECURED', value: 'TLS 1.3', icon: Shield },
            ].map((h, i) => (
              <div key={i} className="glass rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <h.icon className="w-3.5 h-3.5 text-blue-400" />
                  <PulseDot />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">{h.label}</div>
                <div className="text-sm font-semibold">{h.value}</div>
                <div className="text-[10px] text-emerald-400 font-mono">{h.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentPanel({ agentKey, onSelect, metric, label, insight }) {
  const agent = AGENTS[agentKey];
  const Icon = agent.icon;
  return (
    <motion.button
      whileHover={{ y: -3 }}
      onClick={() => onSelect(agentKey)}
      className="text-left glass rounded-2xl p-5 relative overflow-hidden group"
    >
      <div className={cn('absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-30 bg-gradient-to-br', agent.color)}></div>
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br', agent.color)}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{metric}</span>
        </div>
        <div className="text-sm font-semibold mb-1">{agent.name}</div>
        <div className="text-[11px] text-white/50 mb-3">{label}</div>
        <div className="text-xs text-white/80 leading-relaxed border-l-2 border-blue-500/40 pl-3 italic">{insight}</div>
        <div className="flex items-center gap-1 text-[11px] text-blue-400 mt-3 font-medium">
          Open Agent <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================================
// AGENT VIEW (chat + upload + quick prompts)
// ============================================================================
function AgentView({ agentKey, model }) {
  const agent = AGENTS[agentKey];
  const Icon = agent.icon;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState(null);
  const [history, setHistory] = useState([]);
  const [uploadPreview, setUploadPreview] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setConvId(null);
    loadHistory();
  }, [agentKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const r = await fetch(`/api/conversations?agent=${agentKey}`);
      const d = await r.json();
      setHistory(d.conversations || []);
    } catch (e) {}
  };

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg, { role: 'assistant', content: '' }];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          model,
          agent: agentKey,
          conversationId: convId,
        }),
      });

      const cid = res.headers.get('X-Conversation-Id');
      if (cid && !convId) setConvId(cid);

      if (!res.ok || !res.body) {
        const t = await res.text();
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: `**Error:** ${t}` };
          return copy;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }

      // Save assistant reply
      if (cid || convId) {
        await fetch('/api/chat/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: cid || convId, role: 'assistant', content: acc }),
        });
      }
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: `**Connection error:** ${e.message}` };
        return copy;
      });
    } finally {
      setStreaming(false);
      loadHistory();
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setUploadPreview(dataUrl);
      // Save to backend
      await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type: file.type, dataUrl, tag: agentKey, size: file.size }),
      });
      // Add description to chat for vision-capable models OR text reference
      const visionMsg = `[Image uploaded: ${file.name}] Please analyze this ${agentKey === 'meta-ads' ? 'ad creative' : agentKey === 'commerce' ? 'product image' : 'image'} and provide your expert breakdown.`;
      sendMessage(visionMsg);
    };
    reader.readAsDataURL(file);
  };

  const loadConversation = async (id) => {
    const r = await fetch(`/api/conversations/${id}`);
    const d = await r.json();
    if (d.conversation) {
      setMessages(d.conversation.messages || []);
      setConvId(id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* History sidebar */}
      <div className="w-64 shrink-0 border-r border-white/5 glass-strong p-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-white/40 font-semibold">History</div>
          <button onClick={() => { setMessages([]); setConvId(null); }} className="p-1 rounded hover:bg-white/10">
            <Plus className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
        <div className="space-y-1">
          {history.length === 0 && <div className="text-[11px] text-white/30 px-2 py-3">No conversations yet.</div>}
          {history.map(h => (
            <button
              key={h.id}
              onClick={() => loadConversation(h.id)}
              className={cn(
                'w-full text-left px-2 py-2 rounded-lg text-[11px] hover:bg-white/5 transition',
                convId === h.id && 'bg-white/5 border border-white/10'
              )}
            >
              <div className="text-white/90 truncate">{h.messages?.[0]?.content?.slice(0, 60) || 'New chat'}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{new Date(h.updatedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between glass-strong">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br', agent.color)}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold flex items-center gap-2">{agent.name} <PulseDot /></div>
              <div className="text-xs text-white/50">{agent.tagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 hover:bg-white/10 transition cursor-pointer flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <WelcomePanel agent={agent} onPick={sendMessage} />
          ) : (
            messages.map((m, i) => <ChatBubble key={i} message={m} agent={agent} isLast={i === messages.length - 1} streaming={streaming} />)
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/5 glass-strong">
          {uploadPreview && (
            <div className="flex items-center gap-2 mb-2">
              <img src={uploadPreview} alt="" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
              <span className="text-xs text-white/60">Image attached</span>
              <button onClick={() => setUploadPreview(null)} className="text-white/40 hover:text-white"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
              }}
              placeholder={`Ask ${agent.short}... (Enter to send · Shift+Enter for new line)`}
              rows={2}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 pr-16 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              className={cn(
                'absolute right-2 bottom-2 w-9 h-9 rounded-lg flex items-center justify-center transition',
                streaming || !input.trim() ? 'bg-white/5 text-white/30' : 'bg-gradient-to-br from-blue-500 to-purple-500 text-white glow-blue'
              )}
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-white/30 font-mono">
            <span>MODEL: {model}</span>
            <span>{streaming ? 'AI streaming…' : 'READY'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomePanel({ agent, onPick }) {
  const Icon = agent.icon;
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br mx-auto mb-4 glow-blue', agent.color)}>
          <Icon className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{agent.name}</h2>
        <p className="text-white/50 text-sm">{agent.tagline}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agent.quickPrompts.map((p, i) => (
          <motion.button
            key={i}
            whileHover={{ y: -2 }}
            onClick={() => onPick(p)}
            className="text-left glass rounded-xl p-4 hover:border-blue-500/30 hover:bg-white/5 transition group border border-white/5"
          >
            <div className="text-xs text-white/85 leading-relaxed">{p}</div>
            <div className="flex items-center gap-1 text-[10px] text-blue-400 mt-2 font-medium opacity-0 group-hover:opacity-100 transition">
              Run prompt <ArrowUpRight className="w-3 h-3" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message, agent, isLast, streaming }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const Icon = agent.icon;

  const copyContent = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br', agent.color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={cn('max-w-[80%] rounded-2xl px-4 py-3', isUser ? 'bg-blue-500/15 border border-blue-500/30' : 'glass border border-white/5')}>
        <div className="text-sm whitespace-pre-wrap leading-relaxed text-white/95">
          {message.content || (isLast && streaming ? <span className="inline-flex gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full blink"></span><span className="w-2 h-2 bg-blue-400 rounded-full blink" style={{ animationDelay: '0.2s' }}></span><span className="w-2 h-2 bg-blue-400 rounded-full blink" style={{ animationDelay: '0.4s' }}></span></span> : '')}
        </div>
        {!isUser && message.content && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
            <button onClick={copyContent} className="text-[10px] text-white/40 hover:text-white flex items-center gap-1">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="text-[10px] text-white/40 hover:text-white flex items-center gap-1">
              <Bookmark className="w-3 h-3" /> Save
            </button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
          <div className="text-[10px] font-semibold">SO</div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// ANALYTICS VIEW
// ============================================================================
function AnalyticsView() {
  const [stats, setStats] = useState(null);
  useEffect(() => { fetch('/api/stats').then(r => r.json()).then(setStats); }, []);

  const usageData = [
    { agent: 'Meta Ads', calls: 412 },
    { agent: 'Commerce', calls: 318 },
    { agent: 'Support', calls: 287 },
    { agent: 'Content', calls: 526 },
    { agent: 'Competitor', calls: 174 },
  ];
  const modelData = [
    { name: 'DeepSeek', value: 48, color: '#3b82f6' },
    { name: 'Claude', value: 22, color: '#a855f7' },
    { name: 'GPT-4o', value: 18, color: '#ec4899' },
    { name: 'Gemini', value: 12, color: '#f59e0b' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Analytics · Operational Intelligence</div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics Hub</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total AI Ops" value={1717} delta={34.2} icon={Cpu} accent="bg-blue-500" />
        <StatCard label="Revenue Impact" value="$92.4K" delta={18.7} icon={TrendingUp} accent="bg-emerald-500" />
        <StatCard label="Time Saved" value="384h" delta={42.1} icon={Zap} accent="bg-purple-500" />
        <StatCard label="Avg Response" value="1.2s" delta={-12.3} icon={Activity} accent="bg-pink-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="text-sm font-semibold mb-4">AI Operations by Agent</div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={usageData}>
                <XAxis dataKey="agent" stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 11 }} />
                <YAxis stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Bar dataKey="calls" fill="url(#bar-grad)" radius={[8, 8, 0, 0]} />
                <defs>
                  <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="text-sm font-semibold mb-4">Model Distribution</div>
          <div className="h-72 flex items-center justify-center">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={modelData} dataKey="value" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {modelData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {modelData.map(m => (
              <div key={m.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: m.color }}></span>
                <span className="text-white/70">{m.name}</span>
                <span className="text-white/40 ml-auto">{m.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="text-sm font-semibold mb-4">Revenue Trend · 14d</div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={stats?.revenueSeries || []}>
              <XAxis dataKey="day" stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
              <YAxis stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="revenue" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="spend" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WORKFLOWS VIEW
// ============================================================================
function WorkflowsView() {
  const [workflows, setWorkflows] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'ai-task', schedule: 'manual' });

  const load = async () => {
    const r = await fetch('/api/workflows');
    const d = await r.json();
    setWorkflows(d.workflows || []);
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const create = async () => {
    if (!form.name) return;
    await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowNew(false);
    setForm({ name: '', type: 'ai-task', schedule: 'manual' });
    load();
  };

  const run = async (id) => {
    await fetch(`/api/workflows/run/${id}`, { method: 'POST' });
    load();
  };

  const WORKFLOW_TEMPLATES = [
    { type: 'meta-scrape', label: 'Meta Ads Library Scrape', icon: Target, color: 'from-blue-500 to-cyan-500', desc: 'Scrape competitor ads via Playwright' },
    { type: 'shopify-sync', label: 'Shopify Product Sync', icon: ShoppingBag, color: 'from-purple-500 to-pink-500', desc: 'Auto-optimize new product listings' },
    { type: 'whatsapp-auto', label: 'WhatsApp Auto-Reply', icon: MessageCircle, color: 'from-emerald-500 to-teal-500', desc: 'AI-powered customer reply automation' },
    { type: 'content-cal', label: 'Content Calendar Generator', icon: Sparkles, color: 'from-amber-500 to-orange-500', desc: 'Weekly content scheduling' },
    { type: 'competitor-watch', label: 'Competitor Watch', icon: Search, color: 'from-rose-500 to-red-500', desc: 'Monitor competitor brand changes' },
    { type: 'ai-task', label: 'Custom AI Task', icon: Brain, color: 'from-indigo-500 to-violet-500', desc: 'Run scheduled AI prompt' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Workflow Automation</div>
          <h1 className="text-3xl font-bold tracking-tight">Automation Center</h1>
          <p className="text-white/50 text-sm mt-1">Operational AI workflows running on autopilot.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium flex items-center gap-2 glow-blue">
          <Plus className="w-4 h-4" /> New Workflow
        </button>
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass rounded-2xl p-5">
            <div className="text-sm font-semibold mb-3">Choose a template</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {WORKFLOW_TEMPLATES.map(t => (
                <button
                  key={t.type}
                  onClick={() => setForm({ ...form, type: t.type, name: t.label })}
                  className={cn('text-left p-3 rounded-xl border transition', form.type === t.type ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 hover:bg-white/5')}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br mb-2', t.color)}>
                    <t.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-xs font-semibold">{t.label}</div>
                  <div className="text-[10px] text-white/50 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Workflow name" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <select value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <option value="manual" className="bg-[#0a0a10]">Manual</option>
                <option value="hourly" className="bg-[#0a0a10]">Hourly</option>
                <option value="daily" className="bg-[#0a0a10]">Daily</option>
                <option value="weekly" className="bg-[#0a0a10]">Weekly</option>
              </select>
              <button onClick={create} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium">Create</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows.length === 0 && (
          <div className="col-span-full glass rounded-2xl p-10 text-center text-white/40 text-sm">
            No workflows yet. Create your first automation to begin.
          </div>
        )}
        {workflows.map(w => (
          <div key={w.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">{w.name}</div>
                <div className="text-[11px] text-white/40 font-mono uppercase tracking-wider mt-0.5">{w.type}</div>
              </div>
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-mono uppercase', 
                w.status === 'running' ? 'bg-blue-500/20 text-blue-300' : w.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/50')}>
                {w.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-3">
              <span>Schedule: {w.schedule}</span>
              <span>Runs: {w.runs}</span>
            </div>
            <button onClick={() => run(w.id)} className="w-full py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-blue-500/20 hover:border-blue-500/30 transition text-xs font-medium flex items-center justify-center gap-2">
              <Play className="w-3 h-3" /> Execute Now
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// UPLOAD CENTER
// ============================================================================
function UploadView() {
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);

  const load = async () => {
    const r = await fetch('/api/uploads');
    const d = await r.json();
    setUploads(d.uploads || []);
  };
  useEffect(() => { load(); }, []);

  const handleFiles = async (files) => {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, type: file.type, dataUrl: e.target.result, tag: 'general', size: file.size }),
        });
        load();
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Upload Center</div>
        <h1 className="text-3xl font-bold tracking-tight">Asset Vault</h1>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        className={cn(
          'glass rounded-2xl border-2 border-dashed p-12 text-center transition-all',
          dragging ? 'border-blue-500/50 bg-blue-500/5 glow-blue' : 'border-white/10'
        )}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-white/40" />
        <div className="text-lg font-semibold mb-2">Drag & drop your ad creatives, screenshots, or product images</div>
        <div className="text-sm text-white/50 mb-4">PNG · JPG · WEBP · SVG · supports multiple files</div>
        <label className="inline-flex px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-medium cursor-pointer hover:bg-blue-500/30 transition">
          Browse Files
          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files))} />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {uploads.map(u => (
          <div key={u.id} className="glass rounded-xl p-2 group">
            <div className="aspect-square rounded-lg bg-white/5 overflow-hidden flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-white/30" />
            </div>
            <div className="text-[11px] mt-2 truncate font-medium">{u.name}</div>
            <div className="text-[10px] text-white/40 flex items-center justify-between">
              <span className="font-mono uppercase">{u.tag}</span>
              <span>{Math.round((u.size || 0) / 1024)}KB</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SETTINGS VIEW
// ============================================================================
function SettingsView({ model, setModel }) {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Settings</div>
        <h1 className="text-3xl font-bold tracking-tight">Workspace Settings</h1>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="text-sm font-semibold">AI Engine</div>
        <div>
          <label className="text-xs text-white/60 mb-2 block">Default Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
            {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0a10]">{m.label} · {m.tier}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-white/60 mb-2 block">OpenRouter Status</label>
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <PulseDot />
            <span className="text-sm text-emerald-300">Connected · API Key configured securely (server-side)</span>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="text-sm font-semibold">Profile</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/60 mb-1.5 block">Name</label>
            <input defaultValue="Operative" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1.5 block">Workspace</label>
            <input defaultValue="Acme DTC" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="text-sm font-semibold">Theme</div>
        <div className="flex gap-3">
          <button className="flex-1 p-3 rounded-lg bg-[#050507] border-2 border-blue-500/50">
            <div className="text-xs font-medium">Mission Control · Dark</div>
            <div className="text-[10px] text-white/40 mt-1">Default · Active</div>
          </button>
          <button disabled className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 opacity-50 cursor-not-allowed">
            <div className="text-xs font-medium">Light</div>
            <div className="text-[10px] text-white/40 mt-1">Coming soon</div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================
const App = () => {
  const [view, setView] = useState('dashboard');
  const [model, setModel] = useState('deepseek/deepseek-chat');

  const activeAgent = AGENTS[view];
  const viewName = activeAgent?.name || SIDEBAR_ITEMS.find(s => s.id === view)?.label || 'Dashboard';

  return (
    <div className="flex min-h-screen bg-grid bg-radial-glow">
      <Sidebar active={view} onChange={setView} />
      <main className="flex-1 min-w-0 flex flex-col">
        <TopNav model={model} setModel={setModel} agentName={viewName} />
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'dashboard' && <DashboardView onAgentSelect={setView} />}
              {AGENTS[view] && <AgentView agentKey={view} model={model} />}
              {view === 'analytics' && <AnalyticsView />}
              {view === 'workflows' && <WorkflowsView />}
              {view === 'uploads' && <UploadView />}
              {view === 'settings' && <SettingsView model={model} setModel={setModel} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default App;
