'use strict';

// The models BrandForge can route to through OpenRouter, grouped by provider. `ids` are the
// OpenRouter ids we would use, newest first; a model counts as available only when one of them is
// in OpenRouter's live list, so a model that is announced but not yet routable shows as "not yet
// available" instead of failing a user's chat. Tiers: `fast` = cheap, used for planning and
// background steps; `quality` = the answer a visitor reads first.
const MODEL_CATALOG = [
  { provider: 'Anthropic', name: 'Claude Sonnet 5.5', tier: 'quality', ids: ['anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-5'] },
  { provider: 'Anthropic', name: 'Claude Opus 5.5', tier: 'frontier', ids: ['anthropic/claude-opus-5.5', 'anthropic/claude-opus-5'] },
  { provider: 'Anthropic', name: 'Claude Haiku 5.5', tier: 'fast', ids: ['anthropic/claude-haiku-5.5', 'anthropic/claude-haiku-5'] },
  { provider: 'Anthropic', name: 'Claude Sonnet 4.5', tier: 'quality', ids: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-sonnet-4'] },
  { provider: 'OpenAI', name: 'GPT-4.1', tier: 'quality', ids: ['openai/gpt-4.1'] },
  { provider: 'OpenAI', name: 'GPT-4o', tier: 'quality', ids: ['openai/gpt-4o'] },
  { provider: 'OpenAI', name: 'GPT-4o mini', tier: 'fast', ids: ['openai/gpt-4o-mini'] },
  { provider: 'Google', name: 'Gemini 2.5 Pro', tier: 'quality', ids: ['google/gemini-2.5-pro'] },
  { provider: 'Google', name: 'Gemini 2.5 Flash', tier: 'fast', ids: ['google/gemini-2.5-flash'] },
  { provider: 'xAI', name: 'Grok 4', tier: 'frontier', ids: ['x-ai/grok-4'] },
  { provider: 'DeepSeek', name: 'DeepSeek V3', tier: 'fast', ids: ['deepseek/deepseek-chat'] },
  { provider: 'Mistral', name: 'Mistral Large', tier: 'quality', ids: ['mistralai/mistral-large'] },
  { provider: 'Meta', name: 'Llama 4 Maverick', tier: 'fast', ids: ['meta-llama/llama-4-maverick'] },
];

// Order in which the answer model is chosen when nothing is pinned by env: the first one that is
// really routable wins.
const QUALITY_PREFERENCE = ['Claude Sonnet 5.5', 'Claude Sonnet 4.5', 'GPT-4.1', 'Gemini 2.5 Pro', 'GPT-4o'];
const FAST_FALLBACK = 'openai/gpt-4o-mini';

function liveIdOf(entry, liveIds) {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds || []);
  return entry.ids.find((id) => live.has(id)) || null;
}

// Each catalog row with its live status. `liveIds` null means the live list could not be read:
// everything is then "unknown" rather than wrongly "not yet available".
function describeModels(liveIds, catalog = MODEL_CATALOG) {
  return catalog.map((entry) => {
    if (!liveIds) return { ...entry, status: 'unknown', routeId: null };
    const routeId = liveIdOf(entry, liveIds);
    return { ...entry, status: routeId ? 'available' : 'not_yet', routeId };
  });
}

// The OpenRouter id to answer with. An explicit env pin always wins; otherwise the best routable
// preference; if the live list is unreadable, the safe cheap model.
function pickModel(tier, liveIds, env = {}, catalog = MODEL_CATALOG) {
  const pinned = String((tier === 'fast' ? env.OPENROUTER_MODEL : env.OPENROUTER_MODEL_QUALITY) || '').trim();
  if (pinned) return pinned;
  if (tier === 'fast') return FAST_FALLBACK;
  if (!liveIds) return String(env.OPENROUTER_MODEL || '').trim() || FAST_FALLBACK;
  for (const name of QUALITY_PREFERENCE) {
    const entry = catalog.find((item) => item.name === name);
    const routeId = entry ? liveIdOf(entry, liveIds) : null;
    if (routeId) return routeId;
  }
  return String(env.OPENROUTER_MODEL || '').trim() || FAST_FALLBACK;
}

module.exports = { MODEL_CATALOG, QUALITY_PREFERENCE, FAST_FALLBACK, describeModels, pickModel };
