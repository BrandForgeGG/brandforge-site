'use strict';

const { growthConfig } = require('./growth-config.js');

const SEARCH_PROVIDERS = {
  stub: 'stub',
  serper: 'serper',
  tavily: 'tavily',
};

function getSearchProvider(configOverride) {
  const config = configOverride || growthConfig();
  const provider = (config.searchProvider || 'stub').toLowerCase();

  switch (provider) {
    case 'serper':
      return createSerperProvider(config);
    case 'tavily':
      return createTavilyProvider(config);
    case 'stub':
    default:
      return createStubProvider();
  }
}

function createStubProvider() {
  return {
    name: 'stub',
    async search(query) {
      return {
        ok: true,
        results: [],
        source: 'stub',
      };
    },
  };
}

function createSerperProvider(config) {
  return {
    name: 'serper',
    async search(query) {
      const apiKey = config.serperApiKey;
      if (!apiKey) {
        return { ok: false, error: 'SERPER_API_KEY not set', results: [] };
      }
      try {
        const response = await fetch(`https://google.serper.dev/search`, {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: query, num: 5 }),
        });
        if (!response.ok) {
          return { ok: false, error: `serper_http_${response.status}`, results: [] };
        }
        const data = await response.json();
        return {
          ok: true,
          results: (data.organic || []).map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          })),
          source: 'serper',
        };
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 200), results: [] };
      }
    },
  };
}

function createTavilyProvider(config) {
  return {
    name: 'tavily',
    async search(query) {
      const apiKey = config.tavilyApiKey;
      if (!apiKey) {
        return { ok: false, error: 'TAVILY_API_KEY not set', results: [] };
      }
      try {
        const response = await fetch(`https://api.tavily.com/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
        });
        if (!response.ok) {
          return { ok: false, error: `tavily_http_${response.status}`, results: [] };
        }
        const data = await response.json();
        return {
          ok: true,
          results: (data.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          })),
          source: 'tavily',
        };
      } catch (err) {
        return { ok: false, error: String(err).slice(0, 200), results: [] };
      }
    },
  };
}

module.exports = {
  SEARCH_PROVIDERS,
  getSearchProvider,
  createStubProvider,
  createSerperProvider,
  createTavilyProvider,
};
