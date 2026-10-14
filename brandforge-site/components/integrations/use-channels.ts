'use client';

import { useCallback, useEffect, useState } from 'react';

export type ChannelKind = 'telegram' | 'discord' | 'bluesky' | 'slack' | 'tumblr' | 'mastodon' | 'linkedin' | 'x' | 'facebook' | 'instagram' | 'threads' | 'youtube';
export type Channel = { id: string; kind: ChannelKind; label: string };

// The linked channels (names only, never a secret) and whether the person's own Telegram is linked
// for alerts. One place, used by Settings and by Distribute, so both always agree.
export function useChannels(enabled = true) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [tumblrReady, setTumblrReady] = useState(false);
  const [oauthReady, setOauthReady] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    const res = await fetch('/api/carousel/channels').catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as { channels: Channel[]; telegramLinked: boolean; tumblrReady?: boolean; oauthReady?: Record<string, boolean> };
      setChannels(data.channels);
      setTelegramLinked(data.telegramLinked);
      setTumblrReady(Boolean(data.tumblrReady));
      setOauthReady(data.oauthReady ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void reload();
  }, [reload, enabled]);

  const unlink = useCallback(
    async (id: string) => {
      await fetch(`/api/carousel/channels?id=${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { channels, telegramLinked, tumblrReady, oauthReady, loading, reload, unlink };
}
