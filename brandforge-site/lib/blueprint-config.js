'use strict';

// Blueprint Engine configuration (master brief 2026-10-04).
//
// Flags, capability tiers and cost ceilings live here so no route ever reads
// process.env directly. Two rules this file exists to enforce:
//
// 1. Dormant by default. The engine only answers when BLUEPRINT_ENABLED=true,
//    so deploying the code cannot open a public unauthenticated AI endpoint by
//    accident. Research stays a second, separate switch (section 7 of the brief
//    has not arrived yet).
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

function blueprintConfig(env = process.env) {
  const chatModel = env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

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

    // Anonymous session signing. Falls back to the service-role key so the
    // engine works with one env var set; BLUEPRINT_SESSION_SECRET exists so the
    // signature key can be rotated independently of Supabase.
    sessionSecret: env.BLUEPRINT_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '',
    sessionCookieName: 'bf_bp',
    sessionTtlDays: 7,
  };
}

module.exports = { blueprintConfig, envFlag, envInt };
