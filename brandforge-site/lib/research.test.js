const test = require('node:test');
const { beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  isPublicIp,
  assertSafeUrl,
  normalizeQuery,
  canonicalUrl,
  unwrapDdgHref,
  parseDdgHtml,
  normalizeSearchResults,
  searchWeb,
  fetchPage,
  planQueries,
  parseQueries,
  runResearch,
  clearResearchCache,
  cacheGet,
  cacheSet,
} = require('./research.js');

beforeEach(() => clearResearchCache());

const DDG_FIXTURE = `
<table border="0">
  <tr class="result-sponsored">
    <td>1.&nbsp;<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example%2Fpromo&amp;rut=x" class="result-link">Ad result</a></td>
  </tr>
  <tr class="result-sponsored">
    <td class="result-snippet">Ad snippet</td>
  </tr>
  <tr>
    <td>1.&nbsp;<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freal.example%2Fguide%3Fa%3D1&amp;rut=y" class="result-link"><span class="link-text">Real Guide &amp; More</span></a></td>
  </tr>
  <tr>
    <td class="result-snippet">A <b>real</b> snippet &amp; facts</td>
  </tr>
  <tr>
    <td>2.&nbsp;<a rel="nofollow" href="https://duckduckgo.com/duckduckgo-help-pages/" class="result-link">more info</a></td>
  </tr>
  <tr>
    <td>3.&nbsp;<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fsecond.example%2F" class="result-link">Second result</a></td>
  </tr>
  <tr>
    <td class="result-snippet">Second snippet</td>
  </tr>
</table>`;

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CONFIG = {
  researchEnabled: true,
  searchApiKey: 'test-key',
  searchProvider: 'serper',
  researchMaxQueries: 2,
  researchMaxSearches: 3,
  researchMaxFetches: 2,
  researchTimeoutMs: 8000,
  searchCostUsd: 0.001,
  pageTextMaxChars: 4000,
};

// ------------------------------------------------------------ SSRF rules ----

test('isPublicIp is default-deny for private, local and reserved space', () => {
  assert.equal(isPublicIp('10.0.0.5'), false);
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('169.254.169.254'), false, 'cloud metadata');
  assert.equal(isPublicIp('172.16.0.1'), false);
  assert.equal(isPublicIp('172.32.0.1'), true, 'above 172.31 is public');
  assert.equal(isPublicIp('192.168.1.1'), false);
  assert.equal(isPublicIp('100.64.0.1'), false, 'CGNAT');
  assert.equal(isPublicIp('0.0.0.0'), false);
  assert.equal(isPublicIp('224.0.0.1'), false, 'multicast');
  assert.equal(isPublicIp('255.255.255.255'), false);
  assert.equal(isPublicIp('93.184.216.34'), true);
  assert.equal(isPublicIp('1.1.1.1'), true);

  assert.equal(isPublicIp('::1'), false);
  assert.equal(isPublicIp('::'), false);
  assert.equal(isPublicIp('fe80::1'), false);
  assert.equal(isPublicIp('fd12:3456::1'), false, 'ULA');
  assert.equal(isPublicIp('ff02::1'), false, 'multicast');
  assert.equal(isPublicIp('2001:4860:4860::8888'), true);
  assert.equal(isPublicIp('::ffff:10.0.0.1'), false, 'v4-mapped private');
  assert.equal(isPublicIp('::ffff:8.8.8.8'), true, 'v4-mapped public');
  assert.equal(isPublicIp(''), false);
  assert.equal(isPublicIp('not-an-ip'), false);
});

test('assertSafeUrl refuses everything that is not a public http(s) URL', async () => {
  await assert.rejects(assertSafeUrl('ftp://example.com/x'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('javascript:alert(1)'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('https://user:pass@example.com/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://localhost/admin'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://api.internal/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://metadata.google.internal/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://127.0.0.1:8080/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://10.0.0.5/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://169.254.169.254/latest/meta-data/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('http://[::1]/'), { message: 'research_url_unsafe' });
  await assert.rejects(assertSafeUrl('not a url'), { message: 'research_url_invalid' });
});

test('assertSafeUrl resolves hostnames and default-denies private answers', async () => {
  const url = await assertSafeUrl('https://example.com/page', { lookupImpl: PUBLIC_LOOKUP });
  assert.equal(url.hostname, 'example.com');

  await assert.rejects(
    assertSafeUrl('https://rebind.example/', {
      lookupImpl: async () => [{ address: '192.168.0.10', family: 4 }],
    }),
    { message: 'research_url_unsafe' },
    'a DNS answer in private space is refused before any fetch'
  );

  await assert.rejects(
    assertSafeUrl('https://dnsfail.example/', {
      lookupImpl: async () => {
        throw new Error('ENOTFOUND');
      },
    }),
    { message: 'research_dns_failed' }
  );

  const literal = await assertSafeUrl('http://93.184.216.34/x');
  assert.equal(literal.hostname, '93.184.216.34');
});

test('query normalization and canonical URLs', () => {
  assert.equal(normalizeQuery('  Cake ORDER form  '), 'cake order form');
  assert.equal(canonicalUrl('https://Example.com/a#section'), 'https://example.com/a');
  assert.equal(canonicalUrl('https://example.com/a?b=1#x'), 'https://example.com/a?b=1');
  assert.equal(canonicalUrl('nonsense'), null);
});

test('duckduckgo result links unwrap to real public URLs', () => {
  assert.equal(
    unwrapDdgHref('//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.com%2Fpage&amp;rut=abc'),
    'https://www.example.com/page'
  );
  assert.equal(
    unwrapDdgHref('https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1&rut=x'),
    'https://example.com/a?b=1'
  );
  assert.equal(unwrapDdgHref('https://duckduckgo.com/duckduckgo-help-pages/'), null, 'no uddg marker');
  assert.equal(unwrapDdgHref('//duckduckgo.com/l/?uddg=javascript%3Aalert(1)'), null, 'non-http target');
  assert.equal(unwrapDdgHref('//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fabout'), null, 'self links');
  assert.equal(unwrapDdgHref('//duckduckgo.com/l/?uddg=%E0%A4%A'), null, 'broken encoding dropped');
});

test('parseDdgHtml strips sponsored rows, unwraps links, pairs snippets', () => {
  const results = parseDdgHtml(DDG_FIXTURE, 10);
  assert.equal(results.length, 2, 'sponsored rows and disclosure links are dropped');
  assert.deepEqual(
    results.map((item) => item.url),
    ['https://real.example/guide?a=1', 'https://second.example/']
  );
  assert.equal(results[0].title, 'Real Guide & More');
  assert.equal(results[0].snippet, 'A real snippet & facts');
  assert.equal(results[1].title, 'Second result');
  assert.equal(results[1].snippet, 'Second snippet');
  assert.equal(results[0].position, 1);

  assert.deepEqual(parseDdgHtml('<html>anomaly page</html>'), []);
  assert.deepEqual(parseDdgHtml(''), []);
  assert.deepEqual(parseDdgHtml(null, 5), []);
  assert.equal(parseDdgHtml(DDG_FIXTURE, 1).length, 1, 'max clips results');
});

// -------------------------------------------------------------- search -----

test('searchWeb adapts the serper payload to one result shape', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      organic: [
        { position: 1, link: 'https://a.example/one', title: 'One', snippet: 'first result' },
        { position: 2, link: 'https://b.example/two', title: 'Two', snippet: 'second result' },
      ],
    });
  };

  const { results, cached, calls: paid } = await searchWeb({
    query: 'cake shop ordering',
    apiKey: 'k',
    fetchImpl,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://google.serper.dev/search');
  assert.equal(calls[0].init.headers['X-API-KEY'], 'k');
  assert.deepEqual(JSON.parse(calls[0].init.body), { q: 'cake shop ordering', num: 5 });
  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://a.example/one');
  assert.equal(results[0].snippet, 'first result');
  assert.equal(cached, false);
  assert.equal(paid, 1);

  // Same query with different casing/spacing hits the cache: no new call.
  const again = await searchWeb({ query: ' CAKE   shop ordering ', apiKey: 'k', fetchImpl });
  assert.equal(again.cached, true);
  assert.equal(again.calls, 0);
  assert.equal(calls.length, 1);
  assert.equal(again.results.length, 2);
});

test('searchWeb ddg works without any API key and caches like the rest', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(DDG_FIXTURE, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };

  const first = await searchWeb({ query: 'cake ordering', provider: 'ddg', fetchImpl });
  assert.equal(calls[0].url.startsWith('https://lite.duckduckgo.com/lite/?q='), true);
  assert.equal(calls[0].url.includes('cake%20ordering'), true);
  assert.equal(typeof calls[0].init.headers['User-Agent'], 'string', 'lite needs a browser UA');
  assert.equal(first.cached, false);
  assert.equal(first.calls, 1);
  assert.equal(first.results.length, 2);
  assert.equal(first.results[0].url, 'https://real.example/guide?a=1');
  assert.equal(first.results[0].title, 'Real Guide & More');

  const again = await searchWeb({ query: ' cake   ORDERING ', provider: 'ddg', fetchImpl });
  assert.equal(again.cached, true);
  assert.equal(again.calls, 0);
  assert.equal(calls.length, 1);

  await assert.rejects(
    searchWeb({ query: 'challenge', provider: 'ddg', fetchImpl: async () => new Response('x', { status: 202 }) }),
    { message: 'search_http_202' },
    'the anomaly page is an error, never cached as empty results'
  );
  await assert.rejects(
    searchWeb({
      query: 'empty',
      provider: 'ddg',
      fetchImpl: async () => new Response('<html>nothing here</html>', { status: 200 }),
    }),
    { message: 'search_bad_response' }
  );
  await assert.rejects(searchWeb({ query: 'still needs key' }), { message: 'search_disabled' });
});

test('searchWeb adapts the tavily payload and maps failures to coded errors', async () => {
  const results = normalizeSearchResults('tavily', {
    results: [{ url: 'https://c.example/', title: 'C', content: 'body text' }],
  });
  assert.equal(results[0].url, 'https://c.example/');
  assert.equal(results[0].snippet, 'body text');

  await assert.rejects(searchWeb({ query: 'x' }), { message: 'search_disabled' });
  await assert.rejects(
    searchWeb({ query: 'x', apiKey: 'k', fetchImpl: async () => jsonResponse({}, 403) }),
    { message: 'search_http_403' }
  );
  await assert.rejects(
    searchWeb({
      query: 'x',
      apiKey: 'k',
      fetchImpl: async () => new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    }),
    { message: 'search_bad_response' }
  );
  await assert.rejects(
    searchWeb({
      query: 'x',
      apiKey: 'k',
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    }),
    { message: 'research_network' }
  );
});

test('searchWeb speaks linkup: Bearer auth, depth fast, text results only', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      results: [
        { type: 'text', name: 'Ordering guide', url: 'https://linkup.example/guide', content: 'facts here', favicon: '' },
        { type: 'image', name: 'chart', url: 'https://linkup.example/img.png', favicon: '' },
      ],
    });
  };

  const { results, cached, calls: paid } = await searchWeb({
    query: 'cake ordering',
    apiKey: 'lu-key',
    provider: 'linkup',
    fetchImpl,
  });
  assert.equal(calls[0].url, 'https://api.linkup.so/v1/search');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer lu-key');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(
    { q: body.q, depth: body.depth, outputType: body.outputType, maxResults: body.maxResults },
    { q: 'cake ordering', depth: 'fast', outputType: 'searchResults', maxResults: 5 }
  );
  assert.equal(results.length, 1, 'image results are dropped');
  assert.equal(results[0].url, 'https://linkup.example/guide');
  assert.equal(results[0].title, 'Ordering guide');
  assert.equal(results[0].snippet, 'facts here');
  assert.equal(cached, false);
  assert.equal(paid, 1);

  const again = await searchWeb({ query: ' cake   ORDERING ', apiKey: 'lu-key', provider: 'linkup', fetchImpl });
  assert.equal(again.cached, true);
  assert.equal(again.calls, 0);
  assert.equal(calls.length, 1);

  await assert.rejects(
    searchWeb({
      query: 'x',
      apiKey: 'k',
      provider: 'linkup',
      fetchImpl: async () => jsonResponse({ error: { code: 'INSUFFICIENT_FUNDS_CREDITS' } }, 429),
    }),
    { message: 'search_http_429' }
  );
});

test('the search cache expires on time and clears on demand', async () => {
  cacheSet('q:serper:abc', [{ url: 'https://x.example/' }], 1000, 0);
  assert.equal(cacheGet('q:serper:abc', 500) !== null, true);
  assert.equal(cacheGet('q:serper:abc', 1500), null, 'expired entries are dropped');
  cacheSet('q:serper:def', 'v', 60_000, 0);
  clearResearchCache();
  assert.equal(cacheGet('q:serper:def', 1), null);
});

// ---------------------------------------------------------- page fetch -----

test('fetchPage extracts title and readable text, strips scripts and tags', async () => {
  const html =
    '<html><head><title>  My  Page </title><script>var x = 1;</script><style>.a{}</style></head>' +
    '<body><nav>menu</nav><h1>Hello</h1><p>World &amp; fine</p></body></html>';
  const page = await fetchPage('https://example.com/article', {
    fetchImpl: async () => htmlResponse(html),
    lookupImpl: PUBLIC_LOOKUP,
  });
  assert.equal(page.url, 'https://example.com/article');
  assert.equal(page.title, 'My Page');
  assert.equal(page.text.includes('var x'), false, 'scripts stripped');
  assert.equal(page.text.includes('World & fine'), true, 'tags stripped, entities decoded');
  assert.equal(page.cached, false);

  const cached = await fetchPage('https://example.com/article', {
    fetchImpl: async () => {
      throw new Error('must not refetch');
    },
    lookupImpl: PUBLIC_LOOKUP,
  });
  assert.equal(cached.cached, true);
  assert.equal(cached.text, page.text);
});

test('fetchPage enforces status, content type, size and redirect rules', async () => {
  await assert.rejects(
    fetchPage('https://example.com/missing', {
      fetchImpl: async () => htmlResponse('nope', 404),
      lookupImpl: PUBLIC_LOOKUP,
    }),
    { message: 'research_http_404' }
  );

  await assert.rejects(
    fetchPage('https://example.com/file.pdf', {
      fetchImpl: async () =>
        new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      lookupImpl: PUBLIC_LOOKUP,
    }),
    { message: 'research_unsupported_type' }
  );

  await assert.rejects(
    fetchPage('https://example.com/big', {
      fetchImpl: async () => htmlResponse('<html></html>', 200, { 'Content-Length': '9999999' }),
      lookupImpl: PUBLIC_LOOKUP,
      maxBytes: 1000,
    }),
    { message: 'research_too_large' },
    'declared length refused before reading'
  );

  await assert.rejects(
    fetchPage('https://example.com/streamed', {
      fetchImpl: async () => htmlResponse('x'.repeat(5000)),
      lookupImpl: PUBLIC_LOOKUP,
      maxBytes: 1000,
    }),
    { message: 'research_too_large' },
    'streamed body capped while reading'
  );

  // A redirect into private space is refused before the second fetch happens.
  let fetches = 0;
  await assert.rejects(
    fetchPage('https://example.com/away', {
      fetchImpl: async () => {
        fetches += 1;
        if (fetches === 1) {
          return new Response(null, { status: 302, headers: { Location: 'http://10.0.0.5/internal' } });
        }
        throw new Error('must not fetch the private hop');
      },
      lookupImpl: PUBLIC_LOOKUP,
    }),
    { message: 'research_url_unsafe' }
  );
  assert.equal(fetches, 1);

  // Redirect chains are hop-capped.
  let hops = 0;
  await assert.rejects(
    fetchPage('https://example.com/loop', {
      fetchImpl: async () => {
        hops += 1;
        return new Response(null, { status: 302, headers: { Location: `https://example.com/loop${hops}` } });
      },
      lookupImpl: PUBLIC_LOOKUP,
      maxRedirects: 2,
    }),
    { message: 'research_too_many_redirects' }
  );
  assert.equal(hops, 3);

  // A safe redirect is followed and the final URL wins.
  const followed = await fetchPage('https://example.com/start', {
    fetchImpl: async (url) =>
      String(url).endsWith('/start')
        ? new Response(null, { status: 301, headers: { Location: 'https://example.com/final' } })
        : htmlResponse('<title>Final</title><p>done</p>'),
    lookupImpl: PUBLIC_LOOKUP,
  });
  assert.equal(followed.url, 'https://example.com/final');
  assert.equal(followed.title, 'Final');
});

// -------------------------------------------------------- query planning ----

test('planQueries parses arrays, tolerates prose and degrades to none', async () => {
  assert.deepEqual(await planQueries({ input: 'x', ask: async () => '["alpha query", "beta query"]' }), [
    'alpha query',
    'beta query',
  ]);
  assert.deepEqual(
    await planQueries({ input: 'x', ask: async () => 'Here you go:\n```json\n["only one"]\n```\n' }),
    ['only one']
  );
  assert.deepEqual(
    await planQueries({
      input: 'x',
      ask: async () => JSON.stringify(['a', 'b', 'c']),
      maxQueries: 2,
    }),
    ['a', 'b'],
    'planner output is clipped to the cap'
  );
  assert.deepEqual(await planQueries({ input: 'x', ask: async () => 'no array here' }), []);
  assert.deepEqual(
    await planQueries({
      input: 'x',
      ask: async () => {
        throw new Error('planner down');
      },
    }),
    []
  );
  assert.deepEqual(await planQueries({ input: 'x' }), [], 'no ask function, no queries');
  assert.deepEqual(parseQueries(['not', 'strings'], 2), []);
  assert.deepEqual(parseQueries('', 2), []);
});

// --------------------------------------------------------- orchestrator -----

test('runResearch plans, searches, fetches and costs the run', async () => {
  const urlsFetched = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target === 'https://google.serper.dev/search') {
      const body = JSON.parse(init.body);
      return jsonResponse({
        organic: [
          { position: 1, link: 'https://research.example/guide', title: 'Guide', snippet: 'facts' },
          { position: 2, link: 'https://research.example/guide#dup', title: 'Guide again', snippet: 'dup' },
        ],
        ...(body.q ? {} : {}),
      });
    }
    urlsFetched.push(target);
    return htmlResponse('<title>Guide</title><p>Useful citable content.</p>');
  };

  const result = await runResearch({
    input: 'A cake shop needs online orders',
    config: CONFIG,
    ask: async () => '["bakery online ordering systems"]',
    fetchImpl,
    lookupImpl: PUBLIC_LOOKUP,
  });

  assert.deepEqual(result.queries, ['bakery online ordering systems']);
  assert.equal(result.searches, 1);
  assert.equal(result.pages.length, 1, 'fragment dupes collapse to one page');
  assert.equal(result.pages[0].url, 'https://research.example/guide');
  assert.equal(result.pages[0].title, 'Guide');
  assert.equal(urlsFetched.length, 1);
  assert.equal(result.usdEstimate, 0.001);
});

test('runResearch is inert without the switch or the key', async () => {
  let asked = 0;
  const ask = async () => {
    asked += 1;
    return '["q"]';
  };
  const fetchImpl = async () => {
    throw new Error('must not be called');
  };

  const off = await runResearch({ input: 'x', config: { ...CONFIG, researchEnabled: false }, ask, fetchImpl });
  assert.deepEqual(off, { pages: [], searches: 0, queries: [], usdEstimate: 0 });
  assert.equal(asked, 0);

  const noKey = await runResearch({ input: 'x', config: { ...CONFIG, searchApiKey: '' }, ask, fetchImpl });
  assert.deepEqual(noKey, { pages: [], searches: 0, queries: [], usdEstimate: 0 });
  assert.equal(asked, 0);
});

test('runResearch goes live keyless with ddg and costs nothing', async () => {
  let asked = 0;
  const result = await runResearch({
    input: 'x',
    config: { ...CONFIG, searchProvider: 'ddg', searchApiKey: '', searchCostUsd: 0 },
    ask: async () => {
      asked += 1;
      return '["free search query"]';
    },
    fetchImpl: async (url) =>
      String(url).includes('lite.duckduckgo.com')
        ? new Response(DDG_FIXTURE, { status: 200, headers: { 'Content-Type': 'text/html' } })
        : new Response('<title>P</title><p>readable text</p>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
    lookupImpl: PUBLIC_LOOKUP,
  });
  assert.equal(asked, 1);
  assert.equal(result.searches, 1);
  assert.equal(result.queries.length, 1);
  assert.equal(result.pages.length, 2, 'both fixture results are fetched, within the cap');
  assert.equal(result.pages[0].url, 'https://real.example/guide?a=1');
  assert.equal(result.pages[0].text.includes('readable text'), true);
  assert.equal(result.pages[1].url, 'https://second.example/');
  assert.equal(result.usdEstimate, 0, 'the free provider bills nothing');
});

test('runResearch survives search failures, empty plans and deadline exhaustion', async () => {
  // First query's search dies, second succeeds: partial work is kept.
  let searchCalls = 0;
  const partial = await runResearch({
    input: 'x',
    config: CONFIG,
    ask: async () => '["broken query", "working query"]',
    fetchImpl: async (url) => {
      if (String(url).includes('google.serper.dev')) {
        searchCalls += 1;
        if (searchCalls === 1) return jsonResponse({}, 500);
        return jsonResponse({ organic: [{ position: 1, link: 'https://ok.example/p', title: 'OK', snippet: 's' }] });
      }
      return htmlResponse('<title>OK</title><p>text</p>');
    },
    lookupImpl: PUBLIC_LOOKUP,
  });
  assert.equal(partial.searches, 1, 'only the successful call is billed');
  assert.equal(partial.pages.length, 1);

  // Empty plan: zero searches, zero fetches, zero cost.
  const empty = await runResearch({
    input: 'x',
    config: CONFIG,
    ask: async () => '[]',
    fetchImpl: async () => {
      throw new Error('must not be called');
    },
  });
  assert.deepEqual(empty, { pages: [], searches: 0, queries: [], usdEstimate: 0 });

  // An exhausted deadline stops the stage after planning.
  let ticks = 0;
  const timedOut = await runResearch({
    input: 'x',
    config: { ...CONFIG, researchTimeoutMs: 1000 },
    ask: async () => '["a query"]',
    fetchImpl: async () => {
      throw new Error('must not be called past the deadline');
    },
    lookupImpl: PUBLIC_LOOKUP,
    now: () => {
      ticks += 1;
      return ticks === 1 ? 0 : 5000;
    },
  });
  assert.deepEqual(timedOut.queries, ['a query']);
  assert.equal(timedOut.searches, 0);
  assert.equal(timedOut.pages.length, 0);
});

test('runResearch respects the fetch cap', async () => {
  const fetched = [];
  const result = await runResearch({
    input: 'x',
    config: { ...CONFIG, researchMaxFetches: 1 },
    ask: async () => '["q"]',
    fetchImpl: async (url) => {
      if (String(url).includes('google.serper.dev')) {
        return jsonResponse({
          organic: [
            { position: 1, link: 'https://one.example/', title: 'One', snippet: 'a' },
            { position: 2, link: 'https://two.example/', title: 'Two', snippet: 'b' },
          ],
        });
      }
      fetched.push(String(url));
      return htmlResponse('<title>P</title><p>t</p>');
    },
    lookupImpl: PUBLIC_LOOKUP,
  });
  assert.equal(result.pages.length, 1);
  assert.equal(fetched.length, 1);
});
