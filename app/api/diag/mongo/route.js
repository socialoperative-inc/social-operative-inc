// Standalone MongoDB Atlas connectivity diagnostic.
// Never crashes the runtime — always returns clean JSON.
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const safeStr = (v) => (typeof v === 'string' ? v : '');

function classifyUri(uri) {
  const v = safeStr(uri).trim();
  if (!v) return { ok: false, reason: 'empty' };
  const isLocal =
    v.includes('localhost') || v.includes('127.0.0.1') || v.includes('::1');
  const validScheme = v.startsWith('mongodb://') || v.startsWith('mongodb+srv://');
  return {
    ok: validScheme && (!process.env.VERCEL || !isLocal),
    scheme: v.startsWith('mongodb+srv://')
      ? 'srv'
      : v.startsWith('mongodb://')
      ? 'standard'
      : 'unknown',
    isLocal,
    validScheme,
    onVercel: !!process.env.VERCEL,
  };
}

function maskUri(uri) {
  const v = safeStr(uri);
  if (!v) return '(none)';
  // mongodb+srv://user:pass@host/db → mongodb+srv://user:***@host/db
  return v.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
}

export async function GET() {
  const t0 = Date.now();
  const uri = safeStr(process.env.MONGO_URL).trim();
  const dbName = safeStr(process.env.DB_NAME) || 'social_operative';
  const classification = classifyUri(uri);

  if (!uri) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'env-check',
        error: 'MONGO_URL is not configured',
        fix: 'Add MONGO_URL in Vercel → Project → Settings → Environment Variables. Use a MongoDB Atlas SRV connection string like mongodb+srv://USER:PASS@cluster.mongodb.net/<db>?retryWrites=true&w=majority',
        ts: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  if (!classification.validScheme) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'env-check',
        error: 'MONGO_URL has invalid scheme (must start with mongodb:// or mongodb+srv://)',
        scheme: classification.scheme,
        uriPreview: maskUri(uri),
        ts: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  if (process.env.VERCEL && classification.isLocal) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'env-check',
        error: 'MONGO_URL points to localhost/127.0.0.1 while running on Vercel — connection will fail (ECONNREFUSED).',
        fix: 'Replace MONGO_URL on Vercel with your MongoDB Atlas SRV connection string. Never use localhost/127.0.0.1 in serverless production.',
        uriPreview: maskUri(uri),
        ts: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  let client = null;
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 8000,
      connectTimeoutMS: 5000,
    });
    await client.connect();
    const db = client.db(dbName);
    const ping = await db.command({ ping: 1 });
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    return NextResponse.json({
      ok: true,
      stage: 'connected',
      elapsed_ms: Date.now() - t0,
      database: dbName,
      ping,
      collections: collections.map((c) => c.name).slice(0, 30),
      collectionCount: collections.length,
      classification,
      uriPreview: maskUri(uri),
      ts: new Date().toISOString(),
    });
  } catch (e) {
    const msg = safeStr(e?.message) || String(e);
    const code = safeStr(e?.code) || safeStr(e?.cause?.code) || '';
    const isAuth = /authentication|auth failed/i.test(msg);
    const isNetwork = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo/i.test(
      msg + ' ' + code
    );
    return NextResponse.json(
      {
        ok: false,
        stage: 'connect',
        error: msg.slice(0, 500),
        code,
        isAuth,
        isNetwork,
        classification,
        uriPreview: maskUri(uri),
        elapsed_ms: Date.now() - t0,
        hint: isNetwork
          ? 'Check MongoDB Atlas IP allowlist (set to 0.0.0.0/0 for Vercel) and SRV hostname.'
          : isAuth
          ? 'Check the username/password in your SRV string and URL-encode any special characters.'
          : 'Verify the full SRV connection string from Atlas → Connect → Drivers.',
        ts: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (_) {}
    }
  }
}
