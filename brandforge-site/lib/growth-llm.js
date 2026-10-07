'use strict';

const { growthConfig } = require('./growth-config.js');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

async function completeJson({
  baseUrl = DEFAULT_BASE_URL,
  apiKey,
  model,
  system,
  user,
  temperature = 0.2,
  timeoutMs = 60000,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error('growth_llm_no_api_key');
  if (!model) throw new Error('growth_llm_no_model');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`growth_llm_http_${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};

    return {
      text,
      tokensIn: Number(usage.prompt_tokens) || 0,
      tokensOut: Number(usage.completion_tokens) || 0,
      usdEstimate: Number(usage.cost) || 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function llmJson({
  system,
  user,
  model: modelOverride,
  cheap = false,
  timeoutMs,
  fetchImpl,
  config: configOverride,
}) {
  const config = configOverride || growthConfig();
  const model = modelOverride || (cheap ? config.cheapModel : config.strongModel);

  const completion = await completeJson({
    baseUrl: config.openrouterBaseUrl,
    apiKey: config.openrouterApiKey,
    model,
    system,
    user,
    timeoutMs: timeoutMs || 60000,
    fetchImpl,
  });

  let parsed;
  try {
    parsed = JSON.parse(completion.text);
  } catch {
    const match = completion.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    } else {
      parsed = null;
    }
  }

  return { ...completion, parsed };
}

async function llmJsonWithRepair({
  system,
  user,
  validate,
  buildRepairPrompt,
  model: modelOverride,
  cheap = false,
  fetchImpl,
  config: configOverride,
}) {
  const config = configOverride || growthConfig();
  const model = modelOverride || (cheap ? config.cheapModel : config.strongModel);

  let completion = await llmJson({ system, user, model, cheap, fetchImpl, config });
  let result = completion.parsed;
  let valid = result ? validate(result) : { ok: false, errors: ['parse_failed'] };

  if (!valid.ok && buildRepairPrompt) {
    const repairUser = buildRepairPrompt({ previousJson: completion.text, errors: valid.errors });
    const repair = await llmJson({ system, user: repairUser, model, cheap, fetchImpl, config });
    const repaired = repair.parsed;
    const repairValid = repaired ? validate(repaired) : { ok: false, errors: ['parse_failed'] };

    if (repairValid.ok) {
      return { ...repair, parsed: repaired, repaired: true };
    }
    return { ...repair, parsed: repaired, repaired: true, validationErrors: repairValid.errors };
  }

  return { ...completion, parsed: result, repaired: false, validationErrors: valid.ok ? [] : valid.errors };
}

module.exports = { completeJson, llmJson, llmJsonWithRepair };
