'use strict';

// Every AI provider the site can fall back to. All of them speak the same chat-completions format as
// OpenRouter, so one request shape works everywhere. A provider is used only when its key is set; with no
// extra keys the site behaves exactly as before. Order = who is asked first after OpenRouter.
//
//   groq      GROQ_API_KEY         free tier, very fast        (console.groq.com)
//   gemini    GEMINI_API_KEY       free tier, no card          (aistudio.google.com)
//   cf        CF_ACCOUNT_ID + CF_API_TOKEN   free daily allowance (already set for cover art)
//   mistral   MISTRAL_API_KEY      free experimental tier      (console.mistral.ai)
//   deepseek  DEEPSEEK_API_KEY     very cheap                  (platform.deepseek.com)
//   together  TOGETHER_API_KEY     pay as you go               (together.ai)

const PROVIDERS = {
  groq: {
    label: 'Groq',
    ready: (env) => Boolean(env.GROQ_API_KEY),
    key: (env) => env.GROQ_API_KEY,
    baseUrl: () => 'https://api.groq.com/openai/v1',
    model: (env) => env.GROQ_MODEL || 'openai/gpt-oss-120b',
  },
  gemini: {
    label: 'Gemini',
    ready: (env) => Boolean(env.GEMINI_API_KEY),
    key: (env) => env.GEMINI_API_KEY,
    baseUrl: () => 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: (env) => env.GEMINI_MODEL || 'gemini-flash-latest',
  },
  cf: {
    label: 'Cloudflare',
    ready: (env) => Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
    key: (env) => env.CF_API_TOKEN,
    baseUrl: (env) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1`,
    model: (env) => env.CF_TEXT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  },
  mistral: {
    label: 'Mistral',
    ready: (env) => Boolean(env.MISTRAL_API_KEY),
    key: (env) => env.MISTRAL_API_KEY,
    baseUrl: () => 'https://api.mistral.ai/v1',
    model: (env) => env.MISTRAL_MODEL || 'mistral-small-latest',
  },
  deepseek: {
    label: 'DeepSeek',
    ready: (env) => Boolean(env.DEEPSEEK_API_KEY),
    key: (env) => env.DEEPSEEK_API_KEY,
    baseUrl: () => 'https://api.deepseek.com/v1',
    model: (env) => env.DEEPSEEK_MODEL || 'deepseek-flash',
  },
  together: {
    label: 'Together',
    ready: (env) => Boolean(env.TOGETHER_API_KEY),
    key: (env) => env.TOGETHER_API_KEY,
    baseUrl: () => 'https://api.together.xyz/v1',
    model: (env) => env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
};

const ORDER = ['groq', 'gemini', 'cf', 'mistral', 'deepseek', 'together'];

function resolve(id, env) {
  const provider = PROVIDERS[id];
  if (!provider || !provider.ready(env)) return null;
  return { id, label: provider.label, apiKey: provider.key(env), baseUrl: provider.baseUrl(env), model: provider.model(env) };
}

// The providers that have a key, in fallback order.
function configuredProviders(env = process.env) {
  return ORDER.map((id) => resolve(id, env)).filter(Boolean);
}

// "groq:llama-3.3-70b-versatile" or "cf:@cf/meta/..." -> a provider target, or null when it is not one.
// A bare prefix ("groq:") uses that provider's default model.
function parseProviderModel(name, env = process.env) {
  const match = /^(groq|gemini|cf|mistral|deepseek|together):(.*)$/.exec(String(name ?? ''));
  if (!match) return null;
  const target = resolve(match[1], env);
  if (!target) return { id: match[1], missing: true };
  return { ...target, model: match[2] || target.model };
}

// The model list a one-shot JSON writer walks through: the paid model, then every configured provider, then the
// free OpenRouter model as the last resort.
function writerChain(env = process.env) {
  const primary = env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const free = (env.OPENROUTER_FREE_MODELS || 'nvidia/nemotron-3-super-120b-a12b:free').split(',').map((id) => id.trim()).filter(Boolean);
  return [primary, ...configuredProviders(env).map((p) => `${p.id}:`), ...free];
}

module.exports = { configuredProviders, parseProviderModel, writerChain };
