'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

import * as PresenceUtils from '@/lib/presence-utils';

const {
  shapePresenceState,
  shapeTypingState,
  countStaffPresence,
} = PresenceUtils;

export interface PresenceCounts {
  /** Every signed-in tab currently in the app. */
  online: number;
  /** Those tabs that belong to a BrandForge staff account (profiles.role operator/admin). */
  staffOnline: number;
  /** False until the Realtime channel reports its first presence sync. */
  live: boolean;
}

const CHANNEL_NAME = 'brandforge-online';

export interface ConversationPresence {
  /** Display name -> staff flag, for everyone else currently in this conversation. */
  viewers: { name: string; staff: boolean }[];
  /** Display names of the others who are typing right now (self is excluded upstream). */
  typing: string[];
  /** False until the first presence sync arrives, so callers can avoid a false "alone". */
  live: boolean;
}

const EMPTY: ConversationPresence = { viewers: [], typing: [], live: false };

// Per-conversation presence + typing, on the same Realtime channel that carries live messages.
//
// The server is still the source of truth for the transcript: this only *pushes* rows the user
// is already authorised to read (RLS applies to the payload), so it improves latency without
// becoming a second copy of chat state. If the channel fails to subscribe we fall back to the
// existing polling path, so nothing breaks when Realtime is unavailable.
export function useConversationPresence(
  conversationId: string,
  self: { userId: string; name: string; staff: boolean } | null
): ConversationPresence {
  const [presence, setPresence] = useState<ConversationPresence>(EMPTY);

  const userId = self?.userId ?? '';
  const name = self?.name ?? '';
  const staff = self?.staff ?? false;

  useEffect(() => {
    if (!conversationId || !userId) {
      return;
    }

    const channel = supabase.channel(`conversation:${conversationId}`);

    function publish() {
      const raw = channel.presenceState();
      setPresence({
        viewers: shapePresenceState(raw, { userId, name, staff }),
        typing: shapeTypingState(raw, userId),
        live: true,
      });
    }

    channel
      .on('presence', { event: 'sync' }, publish)
      .on('presence', { event: 'join' }, publish)
      .on('presence', { event: 'leave' }, publish)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ name, staff, typing: false });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, userId, name, staff]);

  return presence;
}

// Publishes "this user is typing" to the conversation channel. Realtime throttles track()
// calls, so the flag is only re-sent when it actually changes.
export function useTypingSignal(
  conversationId: string,
  self: { userId: string; name: string; staff: boolean } | null,
  typing: boolean
): void {
  const userId = self?.userId ?? '';
  const name = self?.name ?? '';
  const staff = self?.staff ?? false;

  useEffect(() => {
    if (!conversationId || !userId) {
      return;
    }

    const channel = supabase.channel(`conversation:${conversationId}`);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ name, staff, typing });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, userId, name, staff, typing]);
}

// Re-exported so the rail and the header share one count implementation.
export { countStaffPresence };

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
