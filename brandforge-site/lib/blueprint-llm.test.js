const test = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM, buildRunPrompt, buildRefinePrompt, buildRepairPrompt, parseModelJson, carriedResearch } = require('./blueprint-prompt.js');
const { completeJson } = require('./blueprint-llm.js');

test('the system prompt pins the contract the validator enforces', () => {
  for (const needle of [
    'deliver_now', 'scope_first', 'reframe', 'decline', 'needs_review',
    'needs_discovery', 'reframed', 'discovery_sprint', 'reality_check',
    'AI draft, not final', 'guarantee', 'quickWins', 'clarifyingQuestion',
    'Do NOT output: version, status, createdAt, exits, cost',
  ]) {
    assert.equal(SYSTEM.includes(needle), true, `system prompt missing: ${needle}`);
  }
});

test('the run prompt carries the intake and the source pack ids verbatim', () => {
  const prompt = buildRunPrompt({
    input: 'A booking page that takes deposits for my restaurant',
    sources: [{ id: 'src_input', kind: 'text', label: 'A booking page that takes deposits' }],
  });
  assert.equal(prompt.includes('A booking page that takes deposits for my restaurant'), true);
  assert.equal(prompt.includes('id=src_input'), true);
  assert.equal(prompt.includes('SOURCE PACK'), true);

  const empty = buildRunPrompt({ input: 'x', sources: [] });
  assert.equal(empty.includes('(none)'), true);
});

test('the run prompt carries the research pack with citable urls only', () => {
  const prompt = buildRunPrompt({
    input: 'x',
    sources: [],
    research: [{ url: 'https://research.example/guide', title: 'Guide', text: 'Citable facts.' }],
  });
  assert.equal(prompt.includes('RESEARCH PACK'), true);
  assert.equal(prompt.includes('R1 url=https://research.example/guide'), true);
  assert.equal(prompt.includes('title: Guide'), true);
  assert.equal(prompt.includes('Citable facts.'), true);

  const none = buildRunPrompt({ input: 'x', sources: [], research: [] });
  assert.equal(none.includes('RESEARCH PACK'), true);
  assert.equal(none.includes('(none)'), true);
});

test('carriedResearch extracts and dedupes the research urls the document cites', () => {
  const document = {
    findings: [
      { evidence: [{ kind: 'input', sourceId: 'src_input' }, { kind: 'research', url: 'https://a.example/', title: 'A' }] },
      { evidence: [{ kind: 'research', url: 'https://a.example/', title: 'A dup' }, { kind: 'research', url: 'https://b.example/', title: 'B' }] },
      {},
      null,
    ],
  };
  assert.deepEqual(carriedResearch(document), [
    { url: 'https://a.example/', title: 'A' },
    { url: 'https://b.example/', title: 'B' },
  ]);
  assert.deepEqual(carriedResearch(undefined), []);
  assert.deepEqual(carriedResearch({ findings: 'nope' }), []);

  const prompt = buildRefinePrompt({
    input: 'x',
    sources: [],
    document,
    note: 'tighter',
  });
  assert.equal(prompt.includes('carried from the current version'), true);
  assert.equal(prompt.includes('https://a.example/'), true);
  assert.equal(prompt.includes('https://b.example/'), true);
  assert.equal(prompt.includes('https://a.example/', prompt.indexOf('RESEARCH PACK') + 1), true, 'first match still inside the pack');
});

test('the refine prompt carries intake, current document and the note', () => {
  const prompt = buildRefinePrompt({
    input: 'A booking page for my restaurant',
    sources: [{ id: 'src_input', kind: 'text', label: 'booking page' }],
    document: { lane: 'deliver_now', mirror: 'You want a booking page.' },
    note: 'Make the timeline tighter',
  });
  assert.equal(prompt.includes('A booking page for my restaurant'), true);
  assert.equal(prompt.includes('"lane": "deliver_now"'), true);
  assert.equal(prompt.includes('Make the timeline tighter'), true);
  assert.equal(prompt.indexOf('CURRENT BLUEPRINT') < prompt.indexOf('REFINEMENT NOTE'), true);

  // A hostile note is clipped to the cap, never passed through whole.
  const long = buildRefinePrompt({ input: 'x', sources: [], document: {}, note: 'a'.repeat(900) });
  assert.equal(long.includes('a'.repeat(501)), false);
});

test('the repair prompt lists every validator error and the rejected output', () => {
  const prompt = buildRepairPrompt({
    previousJson: '{"lane":"deliver_now"}',
    errors: ['mirror must be non-empty', 'lane deliver_now requires confidence high'],
  });
  assert.equal(prompt.includes('- mirror must be non-empty'), true);
  assert.equal(prompt.includes('- lane deliver_now requires confidence high'), true);
  assert.equal(prompt.includes('{"lane":"deliver_now"}'), true);
});

test('model JSON parsing strips fences, prose and rejects junk', () => {
  const object = { lane: 'deliver_now' };

  assert.deepEqual(parseModelJson(JSON.stringify(object)), object);
  assert.deepEqual(parseModelJson('```json\n{"lane":"x"}\n```'), { lane: 'x' });
  assert.deepEqual(parseModelJson('Sure! Here it is:\n{"lane":"x"}\nHope that helps.'), { lane: 'x' });

  assert.equal(parseModelJson('no json at all'), null);
  assert.equal(parseModelJson('{broken json}'), null);
  assert.equal(parseModelJson('[{"lane":"x"}]'), null, 'arrays are not blueprints');
  assert.equal(parseModelJson(''), null);
  assert.equal(parseModelJson(null), null);
  assert.equal(parseModelJson(undefined), null);
});

test('the llm caller builds the right request and reads text + usage', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"lane":"deliver_now"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.004 },
      }),
    };
  };

  const result = await completeJson({
    apiKey: 'key-1',
    model: 'openai/gpt-4o-mini',
    system: 'SYS',
    user: 'USER',
    fetchImpl,
  });

  assert.equal(result.text, '{"lane":"deliver_now"}');
  assert.equal(result.tokensIn, 100);
  assert.equal(result.tokensOut, 50);
  assert.equal(result.usdEstimate, 0.004);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer key-1');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'openai/gpt-4o-mini');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, 'SYS');
  assert.equal(body.messages[1].content, 'USER');
});

test('the llm caller fails loudly on config, HTTP and shape problems', async () => {
  await assert.rejects(
    () => completeJson({ model: 'm', system: 's', user: 'u', fetchImpl: async () => ({}) }),
    /llm_not_configured/
  );
  await assert.rejects(
    () => completeJson({ apiKey: 'k', model: '', system: 's', user: 'u', fetchImpl: async () => ({}) }),
    /llm_model_missing/
  );
  await assert.rejects(
    () =>
      completeJson({
        apiKey: 'k',
        model: 'm',
        system: 's',
        user: 'u',
        fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'slow down' }),
      }),
    /llm_http_429/
  );
  await assert.rejects(
    () =>
      completeJson({
        apiKey: 'k',
        model: 'm',
        system: 's',
        user: 'u',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('not json');
          },
        }),
      }),
    /llm_bad_response/
  );
  await assert.rejects(
    () =>
      completeJson({
        apiKey: 'k',
        model: 'm',
        system: 's',
        user: 'u',
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }),
      }),
    /llm_empty_completion/
  );

  // Missing provider cost stays 0 — never a fabricated number.
  const noCost = await completeJson({
    apiKey: 'k',
    model: 'm',
    system: 's',
    user: 'u',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }),
    }),
  });
  assert.equal(noCost.usdEstimate, 0);
});

test('the llm caller turns a hung provider into a timeout error', async () => {
  const fetchImpl = (url, options) =>
    new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

  await assert.rejects(
    () => completeJson({ apiKey: 'k', model: 'm', system: 's', user: 'u', timeoutMs: 1000, fetchImpl }),
    /llm_timeout/
  );
});
