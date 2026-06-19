// AI-powered product copy rewriter using OpenRouter.
//
// Given a Shopify product, generates an optimized title + body_html (description)
// and optional SEO meta. Returns JSON — does NOT touch Shopify (caller decides
// whether to apply the changes via PUT /products/:id).
const safeStr = (v) => (typeof v === 'string' ? v : '');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function stripHtml(html) {
  return safeStr(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSystemPrompt({ tone, brandVoice }) {
  const toneStr = safeStr(tone).trim() || 'premium, confident, benefit-led';
  const voiceStr = safeStr(brandVoice).trim();
  return [
    'You are a senior DTC e-commerce copywriter rewriting product detail pages.',
    `Tone: ${toneStr}.`,
    voiceStr ? `Brand voice notes: ${voiceStr}.` : null,
    'Rules:',
    '- Title: max 70 chars, no ALL CAPS, no emojis, lead with the benefit + product type.',
    '- Description: HTML allowed (<p>, <ul>, <li>, <strong>). 3 short paragraphs OR 2 paragraphs + 5 bullet points.',
    '- Lead with the customer outcome, then features, then how-it-works, then trust signals if material.',
    '- Use sensory and concrete words. No filler. No "Buy now" CTAs (Shopify renders those).',
    '- Never invent ingredients, certifications, awards or numbers that are not in the source.',
    '- SEO title: max 60 chars. SEO description: max 155 chars.',
    'Respond ONLY with strict JSON of shape:',
    '{ "title": string, "body_html": string, "seo_title": string, "seo_description": string, "rationale": string }',
  ].filter(Boolean).join('\n');
}

function buildUserPrompt(product) {
  return [
    `# Source product`,
    `Title: ${safeStr(product?.title)}`,
    product?.vendor ? `Vendor: ${safeStr(product.vendor)}` : null,
    product?.product_type || product?.productType ? `Type: ${safeStr(product?.product_type || product?.productType)}` : null,
    product?.tags ? `Tags: ${safeStr(product.tags)}` : null,
    '',
    `Existing description (HTML stripped for context):`,
    stripHtml(product?.body_html || product?.bodyHtml || '') || '(empty)',
    '',
    `Variants summary:`,
    (product?.variants || []).slice(0, 5).map((v) =>
      `- ${safeStr(v.title || v.option1 || 'Default')} · ${safeStr(v.sku)} · $${safeStr(v.price)}`
    ).join('\n') || '(none)',
  ].filter(Boolean).join('\n');
}

function extractJson(text) {
  if (!text) return null;
  // Try direct parse first
  try { return JSON.parse(text); } catch (_) {}
  // Strip ```json fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch (_) {}
  }
  // Fallback: first {...} block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) {}
  }
  return null;
}

/**
 * Call OpenRouter to rewrite a single product.
 * @returns { title, body_html, seo_title, seo_description, rationale, model }
 */
export async function rewriteProductCopy({ product, tone, brandVoice, model }) {
  const apiKey = safeStr(process.env.OPENROUTER_API_KEY).trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  const useModel = safeStr(model).trim()
    || safeStr(process.env.OPENROUTER_DEFAULT_MODEL).trim()
    || 'deepseek/deepseek-chat';

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': safeStr(process.env.NEXT_PUBLIC_BASE_URL || 'https://social-operative-inc.vercel.app'),
      'X-Title': 'Social Operative — Commerce Hub',
    },
    body: JSON.stringify({
      model: useModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt({ tone, brandVoice }) },
        { role: 'user', content: buildUserPrompt(product) },
      ],
      temperature: 0.6,
      max_tokens: 1200,
    }),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${safeStr(text).slice(0, 300)}`);
  }
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  const raw = safeStr(body?.choices?.[0]?.message?.content);
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed.title !== 'string') {
    throw new Error('AI returned an unparseable response');
  }
  return {
    title: safeStr(parsed.title).slice(0, 255),
    body_html: safeStr(parsed.body_html),
    seo_title: safeStr(parsed.seo_title).slice(0, 70),
    seo_description: safeStr(parsed.seo_description).slice(0, 320),
    rationale: safeStr(parsed.rationale),
    model: useModel,
  };
}
