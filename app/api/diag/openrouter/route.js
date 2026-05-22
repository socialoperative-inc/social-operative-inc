// Standalone OpenRouter connectivity diagnostic — bypasses the catch-all router.
// Uses native fetch ONLY. No axios, no custom TLS agents, no keepAlive.
// Safe under Vercel serverless runtime.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const safeStr = (v) => (typeof v === 'string' ? v : '');
const cleanHeader = (v) =>
  typeof v === 'string' ? v.replace(/[\r\n\t]/g, '').trim() : '';

function buildReferer() {
  const candidates = [
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];
  for (const c of candidates) {
    const v = cleanHeader(c);
    if (!v) continue;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
    } catch (_) {}
  }
  return 'https://social-operative-inc.vercel.app';
}

export async function GET(request) {
  const t0 = Date.now();
  let apiKey = '';
  try {
    const rawKey = safeStr(process.env.OPENROUTER_API_KEY);
    apiKey = cleanHeader(rawKey);

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          stage: 'env-check',
          error: 'OPENROUTER_API_KEY missing in environment variables',
          fix: 'Add OPENROUTER_API_KEY in Vercel → Project → Settings → Environment Variables (Production + Preview).',
        },
        { status: 500 }
      );
    }

    if (!apiKey.startsWith('sk-or-')) {
      return NextResponse.json(
        {
          ok: false,
          stage: 'env-check',
          error: 'OPENROUTER_API_KEY has invalid format (expected prefix sk-or-...)',
          keyPrefix: apiKey.slice(0, 6) + '...',
          keyLength: apiKey.length,
          fix: 'Re-copy the key from https://openrouter.ai/keys — ensure no extra whitespace/newlines.',
        },
        { status: 500 }
      );
    }

    const referer = buildReferer();
    const url = new URL(request.url);
    const doChatTest = url.searchParams.get('chat') === '1';

    // === Phase 1: GET /models (lightweight auth + connectivity test) ===
    const modelsRes = await fetch(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': 'Social Operative',
      },
      // No keepalive, no agent — let Node/undici handle TLS natively.
      cache: 'no-store',
    });

    let modelsBody = '';
    try {
      modelsBody = await modelsRes.text();
    } catch (_) {}

    let modelCount = 0;
    try {
      const j = JSON.parse(modelsBody);
      modelCount = Array.isArray(j?.data) ? j.data.length : 0;
    } catch (_) {}

    const phase1 = {
      ok: modelsRes.ok,
      status: modelsRes.status,
      modelCount,
      bodyPreview: modelsRes.ok ? '(models list received)' : modelsBody.slice(0, 400),
      elapsed_ms: Date.now() - t0,
    };

    if (!modelsRes.ok || !doChatTest) {
      return NextResponse.json({
        ok: modelsRes.ok,
        phase: 'models',
        endpoint: OPENROUTER_MODELS_URL,
        keyPrefix: apiKey.slice(0, 10) + '...',
        keyLength: apiKey.length,
        referer,
        ...phase1,
        ts: new Date().toISOString(),
      });
    }

    // === Phase 2: POST chat/completions (real round-trip with cheapest model) ===
    const t1 = Date.now();
    const chatRes = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': 'Social Operative',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        stream: false,
        max_tokens: 8,
        temperature: 0,
      }),
      cache: 'no-store',
    });

    let chatBody = '';
    try {
      chatBody = await chatRes.text();
    } catch (_) {}

    let chatContent = '';
    try {
      const j = JSON.parse(chatBody);
      chatContent = safeStr(j?.choices?.[0]?.message?.content);
    } catch (_) {}

    return NextResponse.json({
      ok: chatRes.ok,
      phase: 'chat',
      endpoint: OPENROUTER_CHAT_URL,
      keyPrefix: apiKey.slice(0, 10) + '...',
      keyLength: apiKey.length,
      referer,
      models: phase1,
      chat: {
        ok: chatRes.ok,
        status: chatRes.status,
        elapsed_ms: Date.now() - t1,
        content: chatContent || null,
        bodyPreview: chatRes.ok ? chatBody.slice(0, 200) : chatBody.slice(0, 600),
      },
      ts: new Date().toISOString(),
    });
  } catch (e) {
    const msg = safeStr(e?.message) || String(e);
    const code = safeStr(e?.code) || safeStr(e?.cause?.code) || '';
    const isTLS = /ssl|tls|alert|handshake|epipe/i.test(msg);
    return NextResponse.json(
      {
        ok: false,
        stage: 'fetch',
        error: msg,
        code,
        isTLS,
        keyPrefix: apiKey ? apiKey.slice(0, 10) + '...' : '(none)',
        keyLength: apiKey?.length || 0,
        elapsed_ms: Date.now() - t0,
        hint: isTLS
          ? 'TLS/SSL alert usually means: (1) API key has invalid characters or (2) outbound TLS interception. Re-copy key from https://openrouter.ai/keys without trailing whitespace.'
          : 'Verify OPENROUTER_API_KEY is set in Vercel env vars and the function has outbound internet access.',
        ts: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
