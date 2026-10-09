export type ModelTier = 'fast' | 'quality' | 'frontier';
export interface CatalogModel { provider: string; name: string; tier: ModelTier; ids: string[] }
export interface DescribedModel extends CatalogModel { status: 'available' | 'not_yet' | 'unknown'; routeId: string | null }
export declare const MODEL_CATALOG: CatalogModel[];
export declare const QUALITY_PREFERENCE: string[];
export declare const FAST_FALLBACK: string;
export declare function describeModels(liveIds: Set<string> | string[] | null, catalog?: CatalogModel[]): DescribedModel[];
export declare function pickModel(tier: 'fast' | 'quality', liveIds: Set<string> | string[] | null, env?: Record<string, string | undefined>, catalog?: CatalogModel[], canAffordPremium?: boolean): string;
