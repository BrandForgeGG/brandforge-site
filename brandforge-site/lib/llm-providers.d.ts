export type ProviderTarget = { id: string; label: string; apiKey: string; baseUrl: string; model: string };
export declare function configuredProviders(env?: Record<string, string | undefined>): ProviderTarget[];
export declare function parseProviderModel(name: string, env?: Record<string, string | undefined>): (ProviderTarget & { missing?: false }) | { id: string; missing: true } | null;
export declare function writerChain(env?: Record<string, string | undefined>): string[];
