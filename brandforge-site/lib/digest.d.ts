// Types for the dependency-free weekly digest builder (lib/digest.js).

export interface WeeklyDigestInput {
  posted?: number;
  matched?: number;
  funded?: number;
  shipped?: number;
}

export declare function buildWeeklyDigest(input?: WeeklyDigestInput): string;
