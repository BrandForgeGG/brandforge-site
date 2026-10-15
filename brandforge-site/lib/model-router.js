'use strict';

// Which AI does the work, by plan. Free accounts use the everyday chain (a fast paid model, then every free provider
// that has a key). Paying accounts go to the strongest models first, then fall back through the same chain, so a paid
// request never fails just because one provider is down. A model that just failed is moved to the back of the line for a
// few minutes, so the next request goes straight to one that is answering: the load moves to whatever is working.

const { writerChain } = require('./llm-providers.js');

// The strongest writers on OpenRouter, best first. Change with PRO_WRITER_MODELS (comma separated) without a deploy.
const PRO_WRITERS_DEFAULT = ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro'];
const COOL_DOWN_MS = 5 * 60 * 1000;

const cooling = new Map();

function list(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The models a request walks through, in order, for a plan tier ('free' or 'pro'). */
function chainFor(tier, env = process.env) {
  const base = writerChain(env);
  if (tier !== 'pro') return base;
  const pro = list(env.PRO_WRITER_MODELS);
  return [...new Set([...(pro.length ? pro : PRO_WRITERS_DEFAULT), ...base])];
}

/** The same chain with models that failed in the last few minutes moved to the end. */
function writerModels(tier, env = process.env, now = Date.now()) {
  const chain = chainFor(tier, env);
  const ready = chain.filter((model) => !((cooling.get(model) ?? 0) > now));
  const resting = chain.filter((model) => (cooling.get(model) ?? 0) > now);
  return [...ready, ...resting];
}

function noteFailure(model, now = Date.now()) {
  cooling.set(model, now + COOL_DOWN_MS);
}

function noteSuccess(model) {
  cooling.delete(model);
}

/** Image quality by plan: paying accounts always get the best model; free ones get the fast one for bulk work. */
function imageQuality(tier, wanted) {
  return tier === 'pro' ? 'best' : wanted;
}

/** Daily AI limits by plan: paying accounts get ten times the free allowance and are never stopped by the shared cap. */
function limitsFor(tier, limits) {
  return tier === 'pro' ? { ...limits, userDaily: limits.userDaily * 10 } : limits;
}

function resetCooling() {
  cooling.clear();
}

module.exports = { PRO_WRITERS_DEFAULT, COOL_DOWN_MS, chainFor, writerModels, noteFailure, noteSuccess, imageQuality, limitsFor, resetCooling };
