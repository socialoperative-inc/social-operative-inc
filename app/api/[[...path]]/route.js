import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin, verifySupabaseToken } from '../../../lib/supabase/admin';

// ============================================================================
// MongoDB connection (singleton) — used for chat/scrape/activity (stable)
// ============================================================================
let cachedClient = null;
let cachedDb = null;
async function getDb() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
  });
  await client.connect();
  cachedClient = client;
  cachedDb = client.db(process.env.DB_NAME || 'social_operative');
  // Ensure indexes for performance
  try {
    await cachedDb.collection('conversations').createIndex({ userId: 1, updatedAt: -1 });
    await cachedDb.collection('conversations').createIndex({ id: 1 }, { unique: true });
    await cachedDb.collection('activity').createIndex({ userId: 1, ts: -1 });
    await cachedDb.collection('uploads').createIndex({ userId: 1, createdAt: -1 });
    await cachedDb.collection('uploads').createIndex({ id: 1 }, { unique: true });
    await cachedDb.collection('scrape_jobs').createIndex({ userId: 1, createdAt: -1 });
    await cachedDb.collection('workflows').createIndex({ userId: 1, createdAt: -1 });
    await cachedDb.collection('saved_prompts').createIndex({ userId: 1, createdAt: -1 });
  } catch (e) { /* index may already exist */ }
  return cachedDb;
}

// ============================================================================
// Agent system prompts
// ============================================================================
const AGENT_PROMPTS = {
  'meta-ads': `You are META ADS INTELLIGENCE — an elite AI marketing strategist for Meta/Facebook/Instagram ads. You think like a top-tier performance marketer at a 9-figure DTC brand.\n\nYour expertise: ad copy, hooks, headlines, CTAs with conversion psychology; audience targeting & lookalike strategies; ROAS optimization, scaling playbooks, budget recommendations; emotional triggers, pattern interrupts, viral angles; creative analysis (when images provided).\n\nOutput style: Structured, scannable, actionable. Use **bold**, bullets, and clear sections. Always include a "Quick Wins" section and "Scaling Strategy". Be specific, never generic.`,
  'commerce': `You are COMMERCE INTELLIGENCE — an AI-powered e-commerce conversion optimization expert. You've helped DTC brands scale from $0 to $100M.\n\nYour expertise: high-converting product titles/descriptions/bullets; SEO copy; emotional selling angles; offer construction, bundles, upsells; landing page copy, email/SMS/WhatsApp sequences; conversion rate optimization.\n\nOutput style: Production-ready copy. Provide multiple variants (A/B/C). Use frameworks (AIDA, PAS, FAB). Always include CRO recommendations.`,
  'support': `You are SUPPORT OPERATIVE — an AI customer support specialist trained on world-class CX brands.\n\nYour expertise: empathetic customer reply generation; shipping/refund/COD handling; WhatsApp/IG DM/email tone adaptation; de-escalating angry customers; quick replies; tone detection.\n\nOutput style: Warm, human, professional. Match customer's tone. Provide 2-3 reply variants (Empathetic / Direct / Firm). Always include the underlying emotion detected.`,
  'content': `You are CONTENT STUDIO — an AI creative director and viral content strategist.\n\nYour expertise: scroll-stopping captions; Reel hooks, viral hooks, UGC scripts; short-form video ideas, carousel content; email/blog content with narrative arcs; content calendars; brand tone adaptation; emotional storytelling.\n\nOutput style: Bold, energetic, on-brand. Multiple hooks/variants. Include hashtag strategies and posting cadence when relevant. Use viral frameworks (Curiosity Gap, Pattern Interrupt, Stakes).`,
  'competitor': `You are COMPETITOR INTELLIGENCE — an elite market researcher and competitive strategist.\n\nYour expertise: competitor analysis (brand, ads, products, positioning); winning angle detection; pricing strategy and offer teardowns; viral trend monitoring; market positioning gaps; audience insights.\n\nOutput style: Strategic intelligence briefing. Sections: Executive Summary, Strengths, Weaknesses, Opportunities, Winning Angles, Recommended Counter-Strategy. Be analytical, never generic.`,
  'default': `You are SOCIAL OPERATIVE — an elite AI assistant for e-commerce brands. Provide premium, actionable, structured insights. Be direct, intelligent, and operational.`,
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ============================================================================
// OpenRouter streaming with retry + timeout
// ============================================================================
async function callOpenRouter({ messages, model, stream = true, temperature = 0.7, attempt = 1 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

  const controller = new AbortController();
  const timeoutMs = stream ? 90000 : 60000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'https://socialoperative.ai',
        'X-Title': 'Social Operative Inc.',
      },
      body: JSON.stringify({
        model: model || process.env.OPENROUTER_DEFAULT_MODEL || 'deepseek/deepseek-chat',
        messages,
        stream,
        temperature,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      // Retry on transient errors
      if (attempt < 3 && (res.status >= 500 || res.status === 429)) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return callOpenRouter({ messages, model, stream, temperature, attempt: attempt + 1 });
      }
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 300)}`);
    }
    return res;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('AI request timed out');
    if (attempt < 3 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch failed'))) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return callOpenRouter({ messages, model, stream, temperature, attempt: attempt + 1 });
    }
    throw err;
  }
}

async function streamOpenRouter({ messages, model, agent, temperature = 0.7 }) {
  const systemPrompt = AGENT_PROMPTS[agent] || AGENT_PROMPTS.default;
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  let upstream;
  try {
    upstream = await callOpenRouter({ messages: fullMessages, model, stream: true, temperature });
  } catch (err) {
    return new Response(`AI error: ${err.message}`, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') { controller.close(); return; }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content || '';
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch (e) { /* skip bad chunk */ }
          }
        }
        controller.close();
      } catch (err) {
        try { controller.enqueue(encoder.encode(`\n\n[stream error: ${err.message}]`)); } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function completeOpenRouter({ messages, model, agent, temperature = 0.7 }) {
  const systemPrompt = AGENT_PROMPTS[agent] || AGENT_PROMPTS.default;
  const res = await callOpenRouter({
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    model, stream: false, temperature,
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function logActivity(db, { agent, type, summary, model, userId = null }) {
  try {
    await db.collection('activity').insertOne({
      id: uuidv4(), agent, type, summary, model, userId, ts: new Date(),
    });
  } catch (e) { /* don't fail request on log failure */ }
}

// ============================================================================
// Helpers
// ============================================================================
function getAuthToken(request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function err(message, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

// ============================================================================
// Route handler
// ============================================================================
async function handle(request, { params }) {
  const pathArr = params?.path || [];
  const path = '/' + pathArr.join('/');
  const method = request.method;

  try {
    const token = getAuthToken(request);
    const user = await verifySupabaseToken(token);

    // Routes that don't need DB
    if (path === '/' || path === '/health') {
      return NextResponse.json({
        status: 'operational', platform: 'Social Operative Inc.', version: '1.0.0',
        services: { api: 'up', ai: 'up', auth: 'supabase', storage: 'supabase', db: 'mongo' },
      });
    }

    // ====================== AUTH (Supabase) ======================
    if (path === '/auth/signup' && method === 'POST') {
      const { email, password, name } = await request.json();
      if (!email || !password) return err('email and password required', 400);
      if (password.length < 6) return err('password must be at least 6 characters', 400);
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.auth.admin.createUser({
        email, password,
        email_confirm: true,
        user_metadata: { name: name || email.split('@')[0] },
      });
      if (error) return err(error.message, 400);
      // Issue session
      const { data: session, error: sErr } = await admin.auth.signInWithPassword({ email, password });
      if (sErr) return err(sErr.message, 400);
      return NextResponse.json({
        user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name },
        session: { access_token: session.session.access_token, refresh_token: session.session.refresh_token, expires_at: session.session.expires_at },
      });
    }

    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      if (!email || !password) return err('email and password required', 400);
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.auth.signInWithPassword({ email, password });
      if (error) return err(error.message, 401);
      return NextResponse.json({
        user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name },
        session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at },
      });
    }

    if (path === '/auth/me' && method === 'GET') {
      if (!user) return NextResponse.json({ user: null }, { status: 200 });
      return NextResponse.json({ user });
    }

    if (path === '/auth/logout' && method === 'POST') {
      // Client clears token; nothing else needed
      return NextResponse.json({ ok: true });
    }

    if (path === '/auth/refresh' && method === 'POST') {
      const { refresh_token } = await request.json();
      if (!refresh_token) return err('refresh_token required', 400);
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.auth.refreshSession({ refresh_token });
      if (error) return err(error.message, 401);
      return NextResponse.json({
        user: data.user ? { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name } : null,
        session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at },
      });
    }

    // ========== Protected route guard ==========
    const PUBLIC_PATHS = ['/health', '/auth/signup', '/auth/login', '/auth/me', '/auth/refresh', '/auth/logout', '/stats'];
    if (!PUBLIC_PATHS.includes(path) && !user) {
      return err('Unauthorized — please log in', 401);
    }

    const db = await getDb();

    // ====================== CHAT ======================
    if (path === '/chat' && method === 'POST') {
      const body = await request.json();
      const { messages, model, agent, conversationId, temperature, images } = body;
      if (!messages || messages.length === 0) return err('messages required', 400);

      const processedMessages = [...messages];
      if (images && images.length > 0 && processedMessages.length > 0) {
        const last = processedMessages[processedMessages.length - 1];
        if (last.role === 'user') {
          processedMessages[processedMessages.length - 1] = {
            role: 'user',
            content: [
              { type: 'text', text: typeof last.content === 'string' ? last.content : 'Analyze the image(s):' },
              ...images.map(url => ({ type: 'image_url', image_url: { url } })),
            ],
          };
        }
      }

      const convId = conversationId || uuidv4();
      const last = messages[messages.length - 1];
      await db.collection('conversations').updateOne(
        { id: convId },
        {
          $setOnInsert: { id: convId, agent: agent || 'default', userId: user.id, createdAt: new Date() },
          $set: { updatedAt: new Date(), model: model || process.env.OPENROUTER_DEFAULT_MODEL },
          $push: { messages: { id: uuidv4(), role: last.role, content: typeof last.content === 'string' ? last.content : 'image+text', images: images || [], ts: new Date() } },
        },
        { upsert: true }
      );

      await logActivity(db, {
        agent: agent || 'default', type: 'chat',
        summary: (typeof last?.content === 'string' ? last.content : 'multimodal').slice(0, 120),
        model: model || process.env.OPENROUTER_DEFAULT_MODEL, userId: user.id,
      });

      const response = await streamOpenRouter({ messages: processedMessages, model, agent, temperature });
      response.headers.set('X-Conversation-Id', convId);
      return response;
    }

    if (path === '/chat/save' && method === 'POST') {
      const { conversationId, role, content } = await request.json();
      if (!conversationId) return err('conversationId required', 400);
      await db.collection('conversations').updateOne(
        { id: conversationId, userId: user.id },
        { $set: { updatedAt: new Date() }, $push: { messages: { id: uuidv4(), role, content, ts: new Date() } } }
      );
      return NextResponse.json({ ok: true });
    }

    // ====================== CONVERSATIONS (scoped to user) ======================
    if (path === '/conversations' && method === 'GET') {
      const url = new URL(request.url);
      const agent = url.searchParams.get('agent');
      const filter = { userId: user.id, ...(agent ? { agent } : {}) };
      const docs = await db.collection('conversations').find(filter, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(50).toArray();
      return NextResponse.json({ conversations: docs });
    }
    if (pathArr[0] === 'conversations' && pathArr[1] && method === 'GET') {
      const doc = await db.collection('conversations').findOne({ id: pathArr[1], userId: user.id }, { projection: { _id: 0 } });
      return NextResponse.json({ conversation: doc });
    }
    if (pathArr[0] === 'conversations' && pathArr[1] && method === 'DELETE') {
      await db.collection('conversations').deleteOne({ id: pathArr[1], userId: user.id });
      return NextResponse.json({ ok: true });
    }

    // ====================== GENERATE (one-shot) ======================
    if (path === '/generate' && method === 'POST') {
      const { agent, task, input, model } = await request.json();
      const userMsg = `TASK: ${task}\n\nINPUT:\n${input}`;
      const content = await completeOpenRouter({ messages: [{ role: 'user', content: userMsg }], agent, model });
      await logActivity(db, { agent, type: task, summary: input.slice(0, 120), model, userId: user.id });
      return NextResponse.json({ output: content });
    }

    // ====================== UPLOADS (Supabase Storage via REST) ======================
    if (path === '/uploads' && method === 'POST') {
      const body = await request.json();
      const { name, type, dataUrl, tag, size } = body;
      if (!dataUrl || !name) return err('name and dataUrl required', 400);

      // Decode base64
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return err('invalid dataUrl', 400);
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');

      const ext = (name.split('.').pop() || 'bin').toLowerCase();
      const fileId = uuidv4();
      const objectPath = `${user.id}/${fileId}.${ext}`;

      const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Direct REST upload — the secret key in Authorization bypasses RLS
      const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/uploads/${objectPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SECRET}`,
          'apikey': SECRET,
          'Content-Type': mime,
          'x-upsert': 'false',
        },
        body: buffer,
      });

      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        return err(`Upload failed (${uploadRes.status}): ${t.slice(0, 200)}`, 500);
      }

      const publicUrl = `${SUPA_URL}/storage/v1/object/public/uploads/${objectPath}`;

      const doc = {
        id: fileId, name, type: mime, tag: tag || 'general', size: size || buffer.length,
        userId: user.id, objectPath, publicUrl, createdAt: new Date(),
      };
      await db.collection('uploads').insertOne(doc);
      await logActivity(db, { agent: 'upload', type: 'upload', summary: `Uploaded ${name}`, model: '-', userId: user.id });
      const { _id, ...rest } = doc;
      return NextResponse.json({ upload: rest });
    }

    if (path === '/uploads' && method === 'GET') {
      const docs = await db.collection('uploads')
        .find({ userId: user.id }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 }).limit(60).toArray();
      return NextResponse.json({ uploads: docs });
    }

    if (pathArr[0] === 'uploads' && pathArr[1] && method === 'DELETE') {
      const doc = await db.collection('uploads').findOne({ id: pathArr[1], userId: user.id });
      if (doc) {
        try {
          const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
          await fetch(`${SUPA_URL}/storage/v1/object/uploads/${doc.objectPath}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${SECRET}`, 'apikey': SECRET },
          });
        } catch (e) {}
        await db.collection('uploads').deleteOne({ id: pathArr[1], userId: user.id });
      }
      return NextResponse.json({ ok: true });
    }

    // ====================== SAVED PROMPTS ======================
    if (path === '/saved-prompts' && method === 'GET') {
      const docs = await db.collection('saved_prompts').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      return NextResponse.json({ prompts: docs });
    }
    if (path === '/saved-prompts' && method === 'POST') {
      const body = await request.json();
      const doc = { id: uuidv4(), title: body.title, prompt: body.prompt, agent: body.agent || 'default', tags: body.tags || [], userId: user.id, createdAt: new Date() };
      await db.collection('saved_prompts').insertOne(doc);
      const { _id, ...rest } = doc;
      return NextResponse.json({ prompt: rest });
    }
    if (pathArr[0] === 'saved-prompts' && pathArr[1] && method === 'DELETE') {
      await db.collection('saved_prompts').deleteOne({ id: pathArr[1], userId: user.id });
      return NextResponse.json({ ok: true });
    }

    // ====================== WORKFLOWS ======================
    if (path === '/workflows' && method === 'GET') {
      const docs = await db.collection('workflows').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      return NextResponse.json({ workflows: docs });
    }
    if (path === '/workflows' && method === 'POST') {
      const body = await request.json();
      const doc = { id: uuidv4(), name: body.name, type: body.type, schedule: body.schedule || 'manual', config: body.config || {}, status: 'idle', runs: 0, userId: user.id, createdAt: new Date() };
      await db.collection('workflows').insertOne(doc);
      const { _id, ...rest } = doc;
      return NextResponse.json({ workflow: rest });
    }
    if (pathArr[0] === 'workflows' && pathArr[1] === 'run' && pathArr[2] && method === 'POST') {
      const id = pathArr[2];
      await db.collection('workflows').updateOne({ id, userId: user.id }, { $set: { status: 'running', lastRunAt: new Date() }, $inc: { runs: 1 } });
      const wf = await db.collection('workflows').findOne({ id, userId: user.id });
      await logActivity(db, { agent: 'workflow', type: wf?.type || 'workflow', summary: `Executed: ${wf?.name}`, model: '-', userId: user.id });
      setTimeout(async () => {
        try { const db2 = await getDb(); await db2.collection('workflows').updateOne({ id }, { $set: { status: 'completed' } }); } catch (e) {}
      }, 1500);
      return NextResponse.json({ ok: true });
    }
    if (pathArr[0] === 'workflows' && pathArr[1] && method === 'DELETE') {
      await db.collection('workflows').deleteOne({ id: pathArr[1], userId: user.id });
      return NextResponse.json({ ok: true });
    }

    // ====================== META ADS SCRAPER ======================
    if (path === '/scrape/meta-ads' && method === 'POST') {
      const { query, country = 'US', limit = 8 } = await request.json();
      if (!query) return err('query required', 400);
      const jobId = uuidv4();
      await db.collection('scrape_jobs').insertOne({
        id: jobId, type: 'meta-ads', query, country, status: 'running', userId: user.id, createdAt: new Date(),
      });
      try {
        const { scrapeMetaAds } = require('../../../lib/scrapers/meta-ads.js');
        const ads = await scrapeMetaAds({ query, country, limit });
        await db.collection('scrape_jobs').updateOne({ id: jobId },
          { $set: { status: 'completed', completedAt: new Date(), resultCount: ads.length, results: ads } });
        await logActivity(db, { agent: 'competitor', type: 'meta-scrape', summary: `Scraped ${ads.length} ads for "${query}"`, model: 'playwright', userId: user.id });
        return NextResponse.json({ jobId, query, count: ads.length, ads });
      } catch (e) {
        await db.collection('scrape_jobs').updateOne({ id: jobId }, { $set: { status: 'failed', error: e.message } });
        return err(`Scrape failed: ${e.message}`, 500);
      }
    }
    if (path === '/scrape/jobs' && method === 'GET') {
      const jobs = await db.collection('scrape_jobs').find({ userId: user.id }, { projection: { _id: 0, results: 0 } }).sort({ createdAt: -1 }).limit(30).toArray();
      return NextResponse.json({ jobs });
    }
    if (pathArr[0] === 'scrape' && pathArr[1] === 'jobs' && pathArr[2] && method === 'GET') {
      const job = await db.collection('scrape_jobs').findOne({ id: pathArr[2], userId: user.id }, { projection: { _id: 0 } });
      return NextResponse.json({ job });
    }

    // ====================== ACTIVITY ======================
    if (path === '/activity' && method === 'GET') {
      const docs = await db.collection('activity').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(40).toArray();
      return NextResponse.json({ activity: docs });
    }

    // ====================== STATS (public — for landing) ======================
    if (path === '/stats' && method === 'GET') {
      const userFilter = user ? { userId: user.id } : {};
      const [convCount, uploadCount, activityCount, workflowCount, scrapeCount] = await Promise.all([
        db.collection('conversations').countDocuments(userFilter),
        db.collection('uploads').countDocuments(userFilter),
        db.collection('activity').countDocuments(userFilter),
        db.collection('workflows').countDocuments(userFilter),
        db.collection('scrape_jobs').countDocuments(userFilter),
      ]);
      const recentActivity = user
        ? await db.collection('activity').find({ userId: user.id }, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(7).toArray()
        : [];
      const now = Date.now();
      const revenueSeries = Array.from({ length: 14 }, (_, i) => ({
        day: new Date(now - (13 - i) * 86400000).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        revenue: Math.round(8500 + Math.sin(i / 2) * 2200 + Math.random() * 1500),
        spend: Math.round(2400 + Math.cos(i / 2) * 600 + Math.random() * 400),
      }));
      return NextResponse.json({
        metrics: {
          revenue: { value: 184290, delta: 12.4, label: 'Revenue (30d)' },
          roas: { value: 4.82, delta: 8.1, label: 'Blended ROAS' },
          conversions: { value: 2847, delta: 23.7, label: 'Conversions' },
          aiCalls: { value: activityCount, delta: 41.2, label: 'AI Operations' },
          agents: { value: 5, delta: 0, label: 'Active Agents' },
          workflows: { value: workflowCount, delta: 0, label: 'Workflows' },
          conversations: { value: convCount, delta: 0, label: 'Conversations' },
          uploads: { value: uploadCount, delta: 0, label: 'Uploads' },
          scrapes: { value: scrapeCount, delta: 0, label: 'Scrape Jobs' },
        },
        revenueSeries, recentActivity,
        health: { api: 'operational', db: 'operational', ai: 'operational', auth: 'operational', storage: 'operational', uptime: '99.98%' },
      });
    }

    return err(`Route not found: ${path}`, 404);
  } catch (e) {
    console.error('API error:', e);
    return err(e.message || 'Internal server error', 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
export const maxDuration = 120;
