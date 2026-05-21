import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// MongoDB connection (singleton)
// ============================================================================
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  cachedClient = client;
  cachedDb = client.db(process.env.DB_NAME || 'social_operative');
  return cachedDb;
}

// ============================================================================
// Agent system prompts (the "brain" of Social Operative Inc.)
// ============================================================================
const AGENT_PROMPTS = {
  'meta-ads': `You are META ADS INTELLIGENCE — an elite AI marketing strategist for Meta/Facebook/Instagram ads. You think like a top-tier performance marketer at a 9-figure DTC brand.

Your expertise:
- Ad copy, hooks, headlines, CTAs with conversion psychology
- Audience targeting & lookalike strategies
- ROAS optimization, scaling playbooks, budget recommendations
- Emotional triggers, pattern interrupts, viral angles
- Creative analysis (when images provided)

Output style: Structured, scannable, actionable. Use **bold**, bullets, and clear sections. Always include a "Quick Wins" section and "Scaling Strategy". Be specific, never generic.`,

  'commerce': `You are COMMERCE INTELLIGENCE — an AI-powered e-commerce conversion optimization expert. You've helped DTC brands scale from $0 to $100M.

Your expertise:
- High-converting product titles, descriptions, bullet points
- SEO-optimized copy structures
- Emotional selling angles, benefit-driven copy
- Offer construction, bundles, upsells, cross-sells
- Landing page copy, email/SMS/WhatsApp sales sequences
- Conversion rate optimization

Output style: Production-ready copy. Provide multiple variants (A/B/C). Use frameworks like AIDA, PAS, FAB. Always include CRO recommendations.`,

  'support': `You are SUPPORT OPERATIVE — an AI customer support specialist trained on world-class CX brands (Zappos, Apple, Shopify).

Your expertise:
- Empathetic customer reply generation
- Shipping, refund, COD objection handling
- WhatsApp, Instagram DM, email tone adaptation
- De-escalating angry customers
- Quick replies and FAQ automation
- Tone detection and matching

Output style: Warm, human, professional. Match the customer's tone. Provide 2-3 reply variants (Empathetic / Direct / Firm). Always include the underlying emotion detected.`,

  'content': `You are CONTENT STUDIO — an AI creative director and viral content strategist. You think like the top creators on Instagram, TikTok, and YouTube.

Your expertise:
- Scroll-stopping Instagram & Facebook captions
- Reel hooks, viral hooks, UGC scripts
- Short-form video ideas, carousel content
- Email & blog content with narrative arcs
- Content calendars and brand tone adaptation
- Emotional storytelling with conversion intent

Output style: Bold, energetic, on-brand. Provide multiple hooks/variants. Include hashtag strategies and posting cadence when relevant. Use viral content frameworks (Curiosity Gap, Pattern Interrupt, Stakes).`,

  'competitor': `You are COMPETITOR INTELLIGENCE — an elite market researcher and competitive strategist. You decode what's working in any niche.

Your expertise:
- Competitor analysis (brand, ads, products, positioning)
- Winning angle detection and pattern recognition
- Pricing strategy and offer teardowns
- Viral trend monitoring
- Market positioning gaps and opportunities
- Audience insights from competitor data

Output style: Strategic intelligence briefing. Use sections: Executive Summary, Strengths, Weaknesses, Opportunities, Winning Angles, Recommended Counter-Strategy. Be analytical, never generic.`,

  'default': `You are SOCIAL OPERATIVE — an elite AI assistant for e-commerce brands. Provide premium, actionable, structured insights. Be direct, intelligent, and operational.`,
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ============================================================================
// OpenRouter streaming proxy
// ============================================================================
async function streamOpenRouter({ messages, model, agent, temperature = 0.7 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response('OpenRouter API key not configured', { status: 500 });
  }

  const systemPrompt = AGENT_PROMPTS[agent] || AGENT_PROMPTS.default;
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'https://socialoperative.ai',
      'X-Title': 'Social Operative Inc.',
    },
    body: JSON.stringify({
      model: model || process.env.OPENROUTER_DEFAULT_MODEL || 'deepseek/deepseek-chat',
      messages: fullMessages,
      stream: true,
      temperature,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text();
    return new Response(`OpenRouter error: ${errText}`, { status: upstream.status });
  }

  // Transform OpenAI SSE stream into plain text chunks for the client
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
            if (data === '[DONE]') {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content || '';
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch (e) {
              // ignore parse errors on partial lines
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
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

// ============================================================================
// Non-streaming completion (for short snippets, scorecards)
// ============================================================================
async function completeOpenRouter({ messages, model, agent, temperature = 0.7, jsonMode = false }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const systemPrompt = AGENT_PROMPTS[agent] || AGENT_PROMPTS.default;
  const body = {
    model: model || process.env.OPENROUTER_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'https://socialoperative.ai',
      'X-Title': 'Social Operative Inc.',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

// ============================================================================
// Activity logger
// ============================================================================
async function logActivity(db, { agent, type, summary, model, tokens = 0 }) {
  await db.collection('activity').insertOne({
    id: uuidv4(),
    agent,
    type,
    summary,
    model,
    tokens,
    ts: new Date(),
  });
}

// ============================================================================
// Route handler
// ============================================================================
async function handle(request, { params }) {
  const pathArr = params?.path || [];
  const path = '/' + pathArr.join('/');
  const method = request.method;

  try {
    const db = await getDb();

    // -------- Health check --------
    if (path === '/' || path === '/health') {
      return NextResponse.json({
        status: 'operational',
        platform: 'Social Operative Inc.',
        version: '1.0.0',
        ai: 'openrouter',
      });
    }

    // -------- AI Chat (streaming) --------
    // POST /api/chat   body: { messages, model, agent, conversationId? }
    if (path === '/chat' && method === 'POST') {
      const body = await request.json();
      const { messages, model, agent, conversationId, temperature } = body;

      // Persist user message + create/update conversation
      const convId = conversationId || uuidv4();
      const last = messages[messages.length - 1];
      await db.collection('conversations').updateOne(
        { id: convId },
        {
          $setOnInsert: { id: convId, agent: agent || 'default', createdAt: new Date() },
          $set: { updatedAt: new Date(), model: model || process.env.OPENROUTER_DEFAULT_MODEL },
          $push: { messages: { id: uuidv4(), role: last.role, content: last.content, ts: new Date() } },
        },
        { upsert: true }
      );

      await logActivity(db, {
        agent: agent || 'default',
        type: 'chat',
        summary: (last?.content || '').slice(0, 120),
        model: model || process.env.OPENROUTER_DEFAULT_MODEL,
      });

      const response = await streamOpenRouter({ messages, model, agent, temperature });
      // Attach conversation id in response header
      response.headers.set('X-Conversation-Id', convId);
      return response;
    }

    // -------- Save assistant reply after streaming --------
    // POST /api/chat/save  body: { conversationId, role, content }
    if (path === '/chat/save' && method === 'POST') {
      const { conversationId, role, content } = await request.json();
      if (!conversationId) return NextResponse.json({ error: 'missing id' }, { status: 400 });
      await db.collection('conversations').updateOne(
        { id: conversationId },
        {
          $set: { updatedAt: new Date() },
          $push: { messages: { id: uuidv4(), role, content, ts: new Date() } },
        }
      );
      return NextResponse.json({ ok: true });
    }

    // -------- List conversations --------
    if (path === '/conversations' && method === 'GET') {
      const url = new URL(request.url);
      const agent = url.searchParams.get('agent');
      const filter = agent ? { agent } : {};
      const docs = await db.collection('conversations')
        .find(filter, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      return NextResponse.json({ conversations: docs });
    }

    // -------- Get single conversation --------
    if (pathArr[0] === 'conversations' && pathArr[1] && method === 'GET') {
      const doc = await db.collection('conversations').findOne({ id: pathArr[1] }, { projection: { _id: 0 } });
      return NextResponse.json({ conversation: doc });
    }

    // -------- Delete conversation --------
    if (pathArr[0] === 'conversations' && pathArr[1] && method === 'DELETE') {
      await db.collection('conversations').deleteOne({ id: pathArr[1] });
      return NextResponse.json({ ok: true });
    }

    // -------- Quick generators (one-shot, non-streaming, returns structured) --------
    // POST /api/generate  body: { agent, task, input, model }
    if (path === '/generate' && method === 'POST') {
      const { agent, task, input, model } = await request.json();
      const userMsg = `TASK: ${task}\n\nINPUT:\n${input}`;
      const content = await completeOpenRouter({
        messages: [{ role: 'user', content: userMsg }],
        agent,
        model,
      });
      await logActivity(db, { agent, type: task, summary: input.slice(0, 120), model });
      return NextResponse.json({ output: content });
    }

    // -------- Upload (base64 image stored in Mongo) --------
    // POST /api/uploads  body: { name, type, dataUrl, tag? }
    if (path === '/uploads' && method === 'POST') {
      const body = await request.json();
      const doc = {
        id: uuidv4(),
        name: body.name,
        type: body.type,
        dataUrl: body.dataUrl,
        tag: body.tag || 'general',
        size: body.size || 0,
        createdAt: new Date(),
      };
      await db.collection('uploads').insertOne(doc);
      await logActivity(db, { agent: 'upload', type: 'upload', summary: `Uploaded ${body.name}`, model: '-' });
      const { _id, ...rest } = doc;
      return NextResponse.json({ upload: rest });
    }

    if (path === '/uploads' && method === 'GET') {
      const docs = await db.collection('uploads')
        .find({}, { projection: { _id: 0, dataUrl: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      return NextResponse.json({ uploads: docs });
    }

    if (pathArr[0] === 'uploads' && pathArr[1] && method === 'GET') {
      const doc = await db.collection('uploads').findOne({ id: pathArr[1] }, { projection: { _id: 0 } });
      return NextResponse.json({ upload: doc });
    }

    // -------- Saved prompts --------
    if (path === '/saved-prompts' && method === 'GET') {
      const docs = await db.collection('saved_prompts').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      return NextResponse.json({ prompts: docs });
    }
    if (path === '/saved-prompts' && method === 'POST') {
      const body = await request.json();
      const doc = {
        id: uuidv4(),
        title: body.title,
        prompt: body.prompt,
        agent: body.agent || 'default',
        createdAt: new Date(),
      };
      await db.collection('saved_prompts').insertOne(doc);
      const { _id, ...rest } = doc;
      return NextResponse.json({ prompt: rest });
    }
    if (pathArr[0] === 'saved-prompts' && pathArr[1] && method === 'DELETE') {
      await db.collection('saved_prompts').deleteOne({ id: pathArr[1] });
      return NextResponse.json({ ok: true });
    }

    // -------- Workflows (architecture stubs) --------
    if (path === '/workflows' && method === 'GET') {
      const docs = await db.collection('workflows').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      return NextResponse.json({ workflows: docs });
    }
    if (path === '/workflows' && method === 'POST') {
      const body = await request.json();
      const doc = {
        id: uuidv4(),
        name: body.name,
        type: body.type,
        schedule: body.schedule || 'manual',
        config: body.config || {},
        status: 'idle',
        runs: 0,
        createdAt: new Date(),
      };
      await db.collection('workflows').insertOne(doc);
      const { _id, ...rest } = doc;
      return NextResponse.json({ workflow: rest });
    }
    if (pathArr[0] === 'workflows' && pathArr[1] === 'run' && pathArr[2] && method === 'POST') {
      const id = pathArr[2];
      await db.collection('workflows').updateOne({ id }, { $set: { status: 'running', lastRunAt: new Date() }, $inc: { runs: 1 } });
      // Simulate quick AI workflow run
      const wf = await db.collection('workflows').findOne({ id });
      await logActivity(db, { agent: 'workflow', type: wf?.type || 'workflow', summary: `Executed: ${wf?.name}`, model: '-' });
      setTimeout(async () => {
        try { const db2 = await getDb(); await db2.collection('workflows').updateOne({ id }, { $set: { status: 'completed' } }); } catch (e) {}
      }, 1500);
      return NextResponse.json({ ok: true });
    }

    // -------- Activity stream --------
    if (path === '/activity' && method === 'GET') {
      const docs = await db.collection('activity').find({}, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(40).toArray();
      return NextResponse.json({ activity: docs });
    }

    // -------- Dashboard stats --------
    if (path === '/stats' && method === 'GET') {
      const [convCount, uploadCount, activityCount, workflowCount] = await Promise.all([
        db.collection('conversations').countDocuments(),
        db.collection('uploads').countDocuments(),
        db.collection('activity').countDocuments(),
        db.collection('workflows').countDocuments(),
      ]);
      const recentActivity = await db.collection('activity').find({}, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(7).toArray();
      // Generate live mock revenue/ROAS metrics (would come from Meta/Shopify APIs in production)
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
        },
        revenueSeries,
        recentActivity,
        health: { api: 'operational', db: 'operational', ai: 'operational', uptime: '99.98%' },
      });
    }

    return NextResponse.json({ error: 'Not found', path }, { status: 404 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
