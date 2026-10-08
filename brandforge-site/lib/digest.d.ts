// Types for the dependency-free weekly digest builder (lib/digest.js).

export interface WeeklyDigestInput {
  posted?: number;
  matched?: number;
  funded?: number;
  shipped?: number;
}

export declare function buildWeeklyDigest(input?: WeeklyDigestInput): string;
export declare function buildLiveStats(
  stats: Partial<{ chats: number; guestChats: number; members: number; listings: number; specialistApplications: number; contractsSigned: number; milestonesReleased: number }>,
  label?: string
): string | null;
