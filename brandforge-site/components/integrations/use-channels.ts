'use client';

import { useCallback, useEffect, useState } from 'react';

export type ChannelKind = 'telegram' | 'discord' | 'bluesky' | 'slack' | 'tumblr';
export type Channel = { id: string; kind: ChannelKind; label: string };

// The linked channels (names only, never a secret) and whether the person's own Telegram is linked
// for alerts. One place, used by Settings and by Distribute, so both always agree.
export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tumblrReady, setTumblrReady] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch('/api/carousel/channels').catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as { channels: Channel[]; telegramLinked: boolean; tumblrReady?: boolean };
      setChannels(data.channels);
      setTelegramLinked(data.telegramLinked);
      setTumblrReady(Boolean(data.tumblrReady));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void reload();
  }, [reload]);

  const unlink = useCallback(
    async (id: string) => {
      await fetch(`/api/carousel/channels?id=${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { channels, telegramLinked, tumblrReady, loading, reload, unlink };
}
