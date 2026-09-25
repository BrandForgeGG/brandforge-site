// Type declarations for the dependency-free CommonJS funnel recorder (lib/funnel.js).
// Kept beside the implementation so the server and the client helper stay type-safe without
// converting the module to TypeScript (node:test runs the .js directly).

export type FunnelProperties = Record<string, unknown>;

export interface TrackOptions {
  insert: (row: {
    event: string;
    signed_in: boolean;
    visitor_id: string | null;
    properties: Record<string, string | number | boolean>;
    created_at: string;
  }) => unknown;
  signedIn?: boolean;
  visitorId?: string;
  properties?: FunnelProperties;
}

export interface TrackResult {
  recorded: boolean;
  event?: string;
  error?: string;
}

export declare const FUNNEL_EVENTS: readonly string[];
export declare const ALLOWED_PROPERTY_KEYS: Set<string>;
export declare function isFunnelEvent(event: string): boolean;
export declare function sanitizeProperties(properties?: FunnelProperties): Record<string, string | number | boolean>;
export declare function track(event: string, options: TrackOptions): Promise<TrackResult>;
