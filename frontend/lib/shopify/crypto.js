// AES-256-GCM token-at-rest encryption for Shopify access tokens.
// Uses Node's built-in crypto — no external deps.
//
// Format of encryptToken output:  base64(iv || authTag || ciphertext)
//   iv:        12 bytes
//   authTag:   16 bytes
//   ciphertext: variable
//
// Key is sourced from SHOPIFY_ENCRYPTION_KEY (32 raw bytes, base64-encoded).
import crypto from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const raw = (process.env.SHOPIFY_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error(
      'SHOPIFY_ENCRYPTION_KEY is not configured (32 bytes, base64-encoded)'
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `SHOPIFY_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length})`
    );
  }
  cachedKey = buf;
  return cachedKey;
}

export function encryptToken(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptToken: plaintext must be a non-empty string');
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(payload) {
  if (typeof payload !== 'string' || payload.length === 0) {
    throw new Error('decryptToken: payload must be a non-empty string');
  }
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decryptToken: payload too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export function generateState() {
  return crypto.randomBytes(24).toString('base64url');
}
