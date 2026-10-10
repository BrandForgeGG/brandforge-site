'use strict';

// The single HTTP call the Blueprint Engine makes to an OpenAI-compatible
// chat-completions API (OpenRouter by default — same base URL chat uses, so
// there is one provider account, not two).
//
// Design notes:
// - fetch is injectable so node:test can exercise the whole request/response
//   contract without touching the network.
// - A hard timeout via AbortController: a hung provider must surface as an
//   error the route can turn into a friendly 502, never as a frozen request.
// - The return shape is deliberately tiny: the text, the token counts, and a
//   cost number only if the provider actually reported one. No invented costs —
//   the document's cost block is honest or it is zero.

const { parseProviderModel } = require('./llm-providers.js');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

async function completeJson({
  baseUrl = DEFAULT_BASE_URL,
  apiKey,
  model,
  system,
  user,
  temperature = 0.2,
  maxTokens,
  timeoutMs = 60000,
  fetchImpl = fetch,
}) {
  // A model named "groq:", "gemini:", "cf:" ... runs on that provider (OpenAI-compatible) with its own key, so
  // writing keeps working when the first provider has no credit. A provider with no key is simply unavailable.
  const target = parseProviderModel(model);
  if (target) {
    if (target.missing) throw new Error('llm_not_configured');
    return completeJson({ baseUrl: target.baseUrl, apiKey: target.apiKey, model: target.model, system, user, temperature, maxTokens, timeoutMs, fetchImpl });
  }
  if (!apiKey) {
    throw new Error('llm_not_configured');
  }
  if (!model) {
    throw new Error('llm_model_missing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  let response;
  try {
    response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        // A cap keeps a request affordable on an account with little credit.
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) {
      throw new Error('llm_timeout');
    }
    throw new Error(`llm_network: ${error && error.message ? error.message : 'unknown'}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = String(await response.text()).slice(0, 400);
    } catch {
      detail = '';
    }
    // A nearly empty account refuses a big request but will take a smaller one: ask again for what it can
    // afford (once), so a short answer still arrives instead of an error.
    const affordable = Number(/can only afford (\d+)/.exec(detail)?.[1] ?? 0);
    if (response.status === 402 && maxTokens && affordable >= 500 && affordable - 40 < maxTokens) {
      return completeJson({ baseUrl, apiKey, model, system, user, temperature, maxTokens: affordable - 40, timeoutMs, fetchImpl });
    }
    throw new Error(`llm_http_${response.status}: ${detail}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('llm_bad_response');
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('llm_empty_completion');
  }

  const usage = payload && typeof payload.usage === 'object' ? payload.usage : {};
  return {
    text,
    tokensIn: Number(usage.prompt_tokens) || 0,
    tokensOut: Number(usage.completion_tokens) || 0,
    // OpenRouter reports a real dollar cost only when usage accounting is on;
    // otherwise this stays 0 rather than an estimate dressed as a fact.
    usdEstimate: Number(usage.cost) || 0,
  };
}

module.exports = { completeJson, DEFAULT_BASE_URL };
