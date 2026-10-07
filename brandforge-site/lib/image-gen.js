'use strict';

// Free-first image generation with automatic fallback.
//
// Providers are tried in order until one returns a real image. A provider that fails is put on a
// short cool-down (longer for "no credits / unauthorised") so a dead one costs the next visitor
// nothing. Each provider is only attempted when it is configured:
//   cloudflare   CF_ACCOUNT_ID + CF_API_TOKEN   (Workers AI free daily allowance, FLUX schnell)
//   huggingface  HF_TOKEN                        (free serverless inference, rate-limited)
//   pollinations always on, no key               (free, small watermark, third-party service)
//   openrouter   IMAGE_OPENROUTER=true + key     (needs paid credits; off unless asked for)
// Everything here is dependency-free so node:test can drive it with a fake fetch.

const MIN_BYTES = 2_000;
const MAX_BYTES = 8 * 1024 * 1024;
const PROMPT_MAX = 600;
const COOLDOWN_MS = { default: 2 * 60_000, auth: 60 * 60_000 };

const cooldowns = new Map();

const MAGIC = [
  { type: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
];

// Sniff the bytes: a provider that answers 200 with an HTML error page must not become an "image".
function sniffImage(bytes) {
  if (!bytes || bytes.length < MIN_BYTES || bytes.length > MAX_BYTES) return null;
  const hit = MAGIC.find((entry) => entry.test(bytes));
  return hit ? hit.type : null;
}

function cleanPrompt(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PROMPT_MAX);
}

// Cheap, honest first filter. Providers run their own safety checks as well; this only stops the
// obvious categories from ever leaving our server.
const BLOCKED = [
  /\b(child|kid|minor|underage|teen(?:ager)?)s?\b.{0,40}\b(nude|naked|sexual|porn|explicit|nsfw)\b/i,
  /\b(nude|naked|porn(?:ographic)?|explicit sex|nsfw)\b/i,
  /\b(beheading|gore|torture)\b/i,
];
function isBlockedPrompt(prompt) {
  return BLOCKED.some((pattern) => pattern.test(prompt));
}

function sizeFor(aspect) {
  if (aspect === 'portrait') return { width: 768, height: 1024 };
  if (aspect === 'landscape') return { width: 1024, height: 768 };
  return { width: 1024, height: 1024 };
}

async function readBytes(response) {
  return new Uint8Array(await response.arrayBuffer());
}

function failure(provider, message, kind = 'default') {
  const error = new Error(`${provider}: ${message}`);
  error.provider = provider;
  error.kind = kind;
  return error;
}

function classify(provider, status, text) {
  if (status === 401 || status === 402 || status === 403) return failure(provider, `HTTP ${status}`, 'auth');
  return failure(provider, `HTTP ${status} ${String(text ?? '').slice(0, 80)}`);
}

const PROVIDERS = {
  cloudflare: {
    enabled: (env) => Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
    // FLUX.2 first (it renders lettering far better, multipart form input), then FLUX.1 schnell
    // (JSON input, cheaper) as a safety net that still stays inside the free allowance.
    async run({ prompt, aspect, fetchImpl, env, timeoutMs }) {
      const models = env.CF_IMAGE_MODEL
        ? [env.CF_IMAGE_MODEL]
        : ['@cf/black-forest-labs/flux-2-klein-4b', '@cf/black-forest-labs/flux-1-schnell'];
      const { width, height } = sizeFor(aspect);
      const notes = [];
      for (const model of models) {
        try {
          const multipart = model.includes('flux-2');
          let body;
          const headers = { Authorization: `Bearer ${env.CF_API_TOKEN}` };
          if (multipart) {
            body = new FormData();
            body.append('prompt', prompt);
            body.append('width', String(width));
            body.append('height', String(height));
          } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify({ prompt, steps: 6 });
          }
          const response = await fetchImpl(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`,
            { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) },
          );
          if (!response.ok) throw classify('cloudflare', response.status, await response.text().catch(() => ''));
          const json = await response.json().catch(() => null);
          const base64 = json && json.result && json.result.image;
          if (typeof base64 !== 'string') throw failure('cloudflare', 'no image in response');
          const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
          // Earlier model failures ride along so the stored row can say why FLUX.2 was skipped.
          if (notes.length > 0) bytes.note = `cloudflare: ${notes.join('; ')}`.slice(0, 160);
          return bytes;
        } catch (error) {
          // A bad token will fail every model the same way: stop and let the cool-down apply.
          if (error && error.kind === 'auth') throw error;
          notes.push(`${model.split('/').pop()} ${String(error && error.message).replace(/^cloudflare:\s*/, '')}`);
        }
      }
      throw failure('cloudflare', notes.join('; ').slice(0, 160));
    },
  },
  huggingface: {
    enabled: (env) => Boolean(env.HF_TOKEN),
    async run({ prompt, fetchImpl, env, timeoutMs }) {
      const model = env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';
      const response = await fetchImpl(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.HF_TOKEN}`, 'Content-Type': 'application/json', Accept: 'image/png' },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw classify('huggingface', response.status, await response.text().catch(() => ''));
      return readBytes(response);
    },
  },
  pollinations: {
    enabled: () => true,
    async run({ prompt, aspect, fetchImpl, timeoutMs }) {
      const { width, height } = sizeFor(aspect);
      const seed = Math.floor(Math.random() * 1_000_000);
      const url =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;
      const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw classify('pollinations', response.status, await response.text().catch(() => ''));
      return readBytes(response);
    },
  },
  openrouter: {
    enabled: (env) => env.IMAGE_OPENROUTER === 'true' && Boolean(env.OPENROUTER_API_KEY),
    async run({ prompt, fetchImpl, env, timeoutMs }) {
      const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENROUTER_IMAGE_MODEL || 'google/gemini-nano-banana-2.1',
          messages: [{ role: 'user', content: prompt }],
          modalities: ['image', 'text'],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw classify('openrouter', response.status, await response.text().catch(() => ''));
      const json = await response.json().catch(() => null);
      const dataUrl = json && json.choices && json.choices[0] && json.choices[0].message &&
        json.choices[0].message.images && json.choices[0].message.images[0] &&
        json.choices[0].message.images[0].image_url && json.choices[0].message.images[0].image_url.url;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw failure('openrouter', 'no image in response');
      return Uint8Array.from(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
    },
  },
};

const ORDER = ['cloudflare', 'huggingface', 'pollinations', 'openrouter'];

/**
 * @returns {Promise<{ok: true, bytes: Uint8Array, contentType: string, provider: string, attempts: string[]} |
 *                   {ok: false, reason: 'blocked'|'empty'|'unavailable', attempts: string[]}>}
 */
async function generateImage(options) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 25_000;
  const prompt = cleanPrompt(options.prompt);
  const attempts = [];

  if (prompt.length < 3) return { ok: false, reason: 'empty', attempts };
  if (isBlockedPrompt(prompt)) return { ok: false, reason: 'blocked', attempts };

  for (const name of ORDER) {
    const provider = PROVIDERS[name];
    if (!provider.enabled(env)) continue;
    const until = cooldowns.get(name) ?? 0;
    if (until > now()) {
      attempts.push(`${name}: cooling down`);
      continue;
    }
    try {
      const bytes = await provider.run({ prompt, aspect: options.aspect, fetchImpl, env, timeoutMs });
      const contentType = sniffImage(bytes);
      if (!contentType) throw failure(name, 'response was not a usable image');
      if (bytes.note) attempts.push(bytes.note);
      return { ok: true, bytes, contentType, provider: name, attempts };
    } catch (error) {
      const kind = error && error.kind === 'auth' ? 'auth' : 'default';
      cooldowns.set(name, now() + COOLDOWN_MS[kind]);
      attempts.push(error && error.message ? String(error.message).slice(0, 120) : `${name}: failed`);
    }
  }
  return { ok: false, reason: 'unavailable', attempts };
}

function resetCooldowns() {
  cooldowns.clear();
}

module.exports = { generateImage, sniffImage, cleanPrompt, isBlockedPrompt, resetCooldowns, ORDER };
