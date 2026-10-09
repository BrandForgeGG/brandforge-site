export declare function buildSpecialistEmail(
  kind: 'invited' | 'accepted',
  details?: { name?: string; inviteNote?: string; signInUrl?: string; inboxUrl?: string; vettingUrl?: string; profileUrl?: string }
): { subject: string; text: string; html: string } | null;
