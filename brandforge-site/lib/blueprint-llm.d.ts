// Types for the dependency-free CommonJS Blueprint LLM caller (lib/blueprint-llm.js).

export interface LlmCompletion {
  text: string;
  tokensIn: number;
  tokensOut: number;
  usdEstimate: number;
}

export declare const DEFAULT_BASE_URL: string;
export declare function completeJson(options: {
  baseUrl?: string;
  apiKey?: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<LlmCompletion>;
