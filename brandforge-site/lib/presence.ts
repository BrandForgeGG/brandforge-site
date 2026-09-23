'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PresenceCounts {
  /** Every signed-in tab currently in the app. */
  online: number;
  /** Those tabs that belong to a BrandForge staff account (profiles.role operator/admin). */
  staffOnline: number;
  /** False until the Realtime channel reports its first presence sync. */
  live: boolean;
}

const CHANNEL_NAME = 'brandforge-online';

// "Online" is live presence, not a guess from old rows: each signed-in tab joins one Realtime
// channel and reports whether it belongs to staff. Presence is ephemeral, so this needs no table,
// no migration and no polling. If Realtime is unavailable the hook simply stays `live: false` and
// the rail shows a dash instead of a fabricated number.
export function usePresenceCounts(
  identity: { userId: string; staff: boolean } | null
): PresenceCounts {
  const [counts, setCounts] = useState<PresenceCounts>({ online: 0, staffOnline: 0, live: false });

  const userId = identity?.userId ?? '';
  const staff = identity?.staff ?? false;

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: userId } },
    });

    function publish() {
      const entries = Object.values(channel.presenceState()).flat() as { staff?: boolean }[];

      setCounts({
        online: entries.length,
        staffOnline: entries.filter((entry) => Boolean(entry.staff)).length,
        live: true,
      });
    }

    channel
      .on('presence', { event: 'sync' }, publish)
      .on('presence', { event: 'join' }, publish)
      .on('presence', { event: 'leave' }, publish)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ staff });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, staff]);

  return counts;
}
