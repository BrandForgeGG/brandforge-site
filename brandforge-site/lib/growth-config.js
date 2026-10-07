'use strict';

function envFlag(name, env = process.env) {
  return String(env[name] ?? '').trim().toLowerCase() === 'true';
}

function envInt(name, fallback, env = process.env) {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envNum(name, fallback, env = process.env) {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function growthConfig(env = process.env) {
  const chatModel = env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  return {
    enabled: envFlag('GROWTH_ENABLED', env),
    llmEnabled: envFlag('GROWTH_LLM_ENABLED', env),
    fetchEnabled: envFlag('GROWTH_FETCH_ENABLED', env),
    auditEnabled: envFlag('GROWTH_AUDIT_ENABLED', env),
    brandKitEnabled: envFlag('GROWTH_BRAND_KIT_ENABLED', env),
    researchEnabled: envFlag('GROWTH_RESEARCH_ENABLED', env),
    createEnabled: envFlag('GROWTH_CREATE_ENABLED', env),
    distributeEnabled: envFlag('GROWTH_DISTRIBUTE_ENABLED', env),
    measureEnabled: envFlag('GROWTH_MEASURE_ENABLED', env),
    optimizeEnabled: envFlag('GROWTH_OPTIMIZE_ENABLED', env),
    engageEnabled: envFlag('GROWTH_ENGAGE_ENABLED', env),
    cheapModel: env.GROWTH_MODEL_CHEAP || chatModel,
    strongModel: env.GROWTH_MODEL_STRONG || chatModel,
    maxCostUsdPerRun: envNum('GROWTH_MAX_COST_USD_PER_RUN', 0.05, env),
    dailyCostCeilingUsd: envNum('GROWTH_DAILY_COST_CEILING_USD', 5.0, env),
    auditDailyLimit: envInt('GROWTH_AUDIT_DAILY_LIMIT', 3, env),
    auditDailyLimitAnonymous: envInt('GROWTH_AUDIT_DAILY_LIMIT_ANONYMOUS', 1, env),
    competitorXrayMonthlyLimit: envInt('GROWTH_COMPETITOR_XRAY_MONTHLY_LIMIT', 5, env),
    staticCreativesMonthlyLimit: envInt('GROWTH_STATIC_CREATIVES_MONTHLY_LIMIT', 30, env),
    videoAdsWeeklyLimit: envInt('GROWTH_VIDEO_ADS_WEEKLY_LIMIT', 2, env),
    schedulerMaxChannels: envInt('GROWTH_SCHEDULER_MAX_CHANNELS', 3, env),
    schedulerMaxQueuedPosts: envInt('GROWTH_SCHEDULER_MAX_QUEUED_POSTS', 30, env),
    fetchTimeoutMs: envInt('GROWTH_FETCH_TIMEOUT_MS', 10000, env),
    fetchMaxBytes: envInt('GROWTH_FETCH_MAX_BYTES', 2097152, env),
    fetchMaxRedirects: envInt('GROWTH_FETCH_MAX_REDIRECTS', 3, env),
    openrouterApiKey: env.OPENROUTER_API_KEY || '',
    openrouterBaseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  };
}

module.exports = { growthConfig, envFlag, envInt, envNum };
