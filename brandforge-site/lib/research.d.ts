// Types for the dependency-free CommonJS research adapter (lib/research.js).

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  position: number;
}

export interface SearchResponse {
  results: SearchResult[];
  cached: boolean;
  calls: number;
}

export interface ResearchPage {
  url: string;
  title: string;
  text: string;
}

export interface FetchPageResult extends ResearchPage {
  cached: boolean;
}

export interface ResearchResult {
  pages: ResearchPage[];
  searches: number;
  queries: string[];
  usdEstimate: number;
}

export interface ResearchConfigShape {
  researchEnabled: boolean;
  searchApiKey: string;
  searchProvider: string;
  researchMaxQueries: number;
  researchMaxSearches: number;
  researchMaxFetches: number;
  researchTimeoutMs: number;
  searchCostUsd: number;
  pageTextMaxChars: number;
}

export type ResearchAsk = (prompt: string, timeoutMs?: number) => string | Promise<string>;
export type ResearchFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type ResearchLookup = (host: string) => Promise<Array<{ address: string; family?: number }>>;

export declare const SERPER_ENDPOINT: string;
export declare const TAVILY_ENDPOINT: string;
export declare const LINKUP_ENDPOINT: string;
export declare const DDG_ENDPOINT: string;
export declare const PLANNER_SYSTEM: string;

export declare function isPublicIp(ip: string): boolean;
export declare function assertSafeUrl(
  raw: string,
  options?: { lookupImpl?: ResearchLookup }
): Promise<URL>;
export declare function normalizeQuery(query: unknown): string;
export declare function canonicalUrl(raw: unknown): string | null;
export declare function unwrapDdgHref(raw: unknown): string | null;
export declare function parseDdgHtml(html: unknown, max?: number): SearchResult[];
export declare function normalizeSearchResults(
  provider: string,
  payload: unknown
): SearchResult[];
export declare function searchWeb(options: {
  query: string;
  num?: number;
  provider?: string;
  apiKey?: string;
  fetchImpl?: ResearchFetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}): Promise<SearchResponse>;
export declare function fetchPage(
  rawUrl: string,
  options?: {
    fetchImpl?: ResearchFetch;
    lookupImpl?: ResearchLookup;
    timeoutMs?: number;
    maxBytes?: number;
    maxChars?: number;
    maxRedirects?: number;
    cacheTtlMs?: number;
    now?: () => number;
  }
): Promise<FetchPageResult>;
export declare function parseQueries(raw: unknown, maxQueries: number): string[];
export declare function planQueries(options: {
  input: string;
  ask?: ResearchAsk;
  maxQueries?: number;
  timeoutMs?: number;
}): Promise<string[]>;
export declare function runResearch(options: {
  input: string;
  config: ResearchConfigShape;
  ask?: ResearchAsk;
  fetchImpl?: ResearchFetch;
  lookupImpl?: ResearchLookup;
  now?: () => number;
}): Promise<ResearchResult>;
export declare function clearResearchCache(): void;
export declare function cacheGet(key: string, now?: number): unknown;
export declare function cacheSet(key: string, value: unknown, ttlMs: number, now?: number): void;
