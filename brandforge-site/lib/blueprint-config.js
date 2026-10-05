'use strict';

// Blueprint Engine configuration (master brief 2026-10-04).
//
// Flags, capability tiers and cost ceilings live here so no route ever reads
// process.env directly. Two rules this file exists to enforce:
//
// 1. Dormant by default. The engine only answers when BLUEPRINT_ENABLED=true,
//    so deploying the code cannot open a public unauthenticated AI endpoint by
//    accident. Research stays a second, separate switch (BLUEPRINT_RESEARCH).
// 2. Model tiers, never model names. Business logic names *roles* (extract,
//    synth); the concrete provider/model string comes from env so the founder
//    can change vendors without touching code. Defaults fall back to whatever
//    chat already uses.

function envFlag(name, env = process.env) {
  return String(env[name] ?? '').trim().toLowerCase() === 'true';
}

function envInt(name, fallback, env = process.env) {
  const raw = Number.parseInt(String(env[name] ?? ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function envNum(name, fallback, env = process.env) {
  const raw = Number.parseFloat(String(env[name] ?? ''));
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function blueprintConfig(env = process.env) {
  const chatModel = env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  // Research provider: free and keyless by default (DuckDuckGo lite). Keyed
  // adapters (serper/tavily/linkup) engage only when SEARCH_API_KEY is set.
  const searchProvider = env.SEARCH_PROVIDER || 'ddg';

  return {
    enabled: envFlag('BLUEPRINT_ENABLED', env),
    researchEnabled: envFlag('BLUEPRINT_RESEARCH', env),

    // Capability tiers (brief 4.3): cheap model for parsing/triage, strong model
    // for synthesis and document assembly. Same default until tiers are tuned.
    extractModel: env.BLUEPRINT_MODEL_EXTRACT || chatModel,
    synthModel: env.BLUEPRINT_MODEL_SYNTH || chatModel,

    // Cost ceilings. Interim defaults until section 7 (quotas) lands: per IP per
    // hour, per session per UTC day.
    maxSessionsPerIpPerHour: envInt('BLUEPRINT_IP_HOURLY', 20, env),
    runsPerSessionPerDay: envInt('BLUEPRINT_DAILY_SESSION', 10, env),

    // Intake bounds (brief 4.6: cap the problem statement).
    intakeMinChars: 5,
    intakeMaxChars: 4000,

    llmTimeoutMs: envInt('BLUEPRINT_LLM_TIMEOUT_MS', 60000, env),

    // Research stage (brief 4.5): provider adapter + per-run budgets. The
    // stage runs when the research switch is on AND (the provider is keyless
    // or a search key is present), so the free default can go live with a
    // single env var.
    searchProvider,
    searchApiKey: env.SEARCH_API_KEY || '',
    researchMaxQueries: envInt('BLUEPRINT_RESEARCH_QUERIES', 2, env),
    researchMaxSearches: envInt('BLUEPRINT_RESEARCH_SEARCHES', 3, env),
    researchMaxFetches: envInt('BLUEPRINT_RESEARCH_FETCHES', 2, env),
    // Real marketing pages need seconds to fetch; 14s keeps the whole run
    // comfortably inside the route's 60s budget alongside the LLM calls.
    researchTimeoutMs: envInt('BLUEPRINT_RESEARCH_TIMEOUT_MS', 14000, env),
    // Free providers cost nothing; keyed APIs assume $0.001 per search until
    // SEARCH_COST_USD says otherwise.
    searchCostUsd: envNum('SEARCH_COST_USD', searchProvider === 'ddg' ? 0 : 0.001, env),
    pageTextMaxChars: envInt('BLUEPRINT_RESEARCH_CHARS', 4000, env),

    // Anonymous session signing. Falls back to the service-role key so the
    // engine works with one env var set; BLUEPRINT_SESSION_SECRET exists so the
    // signature key can be rotated independently of Supabase.
    sessionSecret: env.BLUEPRINT_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '',
    sessionCookieName: 'bf_bp',
    sessionTtlDays: 7,
  };
}

module.exports = { blueprintConfig, envFlag, envInt, envNum };
