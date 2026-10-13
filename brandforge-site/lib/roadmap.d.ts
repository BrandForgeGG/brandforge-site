export type RoadmapStatus = 'live' | 'building' | 'next';
export const DIRECTION: { title: string; body: string }[];
export const ROADMAP: { status: RoadmapStatus; title: string; body: string; since?: string }[];
export const STATUS_LABEL: Record<RoadmapStatus, string>;
