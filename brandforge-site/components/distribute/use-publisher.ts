'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { useChannels } from '@/components/integrations/use-channels';
import { isLocked } from '@/lib/locked-channels.js';
import { postFiles, type PostBrand } from '@/components/distribute/render-post';
import type { PlannedDay, PlannedPost } from '@/lib/distribute-plan.js';

export type ScheduledItem = { id: string; label: string; runAt: string; status: 'scheduled' | 'posting' | 'done' | 'partial' | 'failed' | 'cancelled'; channelIds: string[]; results: Record<string, { ok: boolean; note?: string }> };

const PICK_KEY = 'bf:distribute-channels';

function localISO(day: PlannedDay, post: PlannedPost): string {
  return new Date(`${day.date}T${post.time}:00`).toISOString();
}

// Posting from Distribute: which linked channels get the posts, scheduling one post or the whole week, posting now, and
// what became of each scheduled post. The pictures are drawn here in the browser (the same ones that are downloaded),
// then handed to the server, which sends them at the planned time.
export function usePublisher(signedIn: boolean | null) {
  const { channels: linked, loading, reload } = useChannels(Boolean(signedIn));
  const channels = linked.filter((channel) => !isLocked(channel.kind));
  const [picked, setPicked] = useState<string[]>([]);
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetchAuthed('/api/distribute/schedule').catch(() => null);
    if (!res || !res.ok) return;
    const data = (await res.json()) as { ready: boolean; posts: ScheduledItem[] };
    setReady(data.ready);
    setItems(data.posts);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch once signed in
    void refresh();
  }, [signedIn, refresh]);

  // The chosen channels come back from this browser; until channels are known, nothing is picked.
  useEffect(() => {
    if (loading || loaded.current) return;
    loaded.current = true;
    let saved: string[] = [];
    try {
      saved = JSON.parse(window.localStorage.getItem(PICK_KEY) ?? '[]') as string[];
    } catch {
      saved = [];
    }
    const known = saved.filter((id) => channels.some((c) => c.id === id));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the saved choice once channels load
    setPicked(known.length > 0 ? known : channels.map((c) => c.id));
  }, [loading, channels]);

  // While anything is waiting or sending, look again every minute so the statuses move by themselves.
  useEffect(() => {
    if (!items.some((item) => item.status === 'scheduled' || item.status === 'posting')) return;
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [items, refresh]);

  function toggle(id: string) {
    setPicked((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      try {
        window.localStorage.setItem(PICK_KEY, JSON.stringify(next));
      } catch {
        /* the choice just is not remembered */
      }
      return next;
    });
  }

  const form = useCallback(
    async (day: PlannedDay, post: PlannedPost, brand: PostBrand): Promise<FormData | null> => {
      const files = await postFiles(post, brand, day.date);
      if (files.length === 0) return null;
      const body = new FormData();
      body.append('caption', post.caption);
      body.append('channelIds', JSON.stringify(picked));
      files.slice(0, 10).forEach((file, i) => body.append(`slide${i}`, file.blob, file.name));
      return body;
    },
    [picked],
  );

  async function schedule(day: PlannedDay, post: PlannedPost, brand: PostBrand): Promise<boolean> {
    const body = await form(day, post, brand);
    if (!body) return false;
    body.append('runAt', localISO(day, post));
    body.append('label', post.id);
    const res = await fetchAuthed('/api/distribute/schedule', { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Could not schedule that.');
    return true;
  }

  async function scheduleOne(day: PlannedDay, post: PlannedPost, brand: PostBrand) {
    if (busy || picked.length === 0) return;
    setBusy(post.id);
    setMessage(null);
    try {
      await schedule(day, post, brand);
      trackEvent('distribute_downloaded', { source: 'scheduled' });
      setMessage({ text: 'Scheduled. It goes out at its time.', bad: false });
      await refresh();
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : 'Could not schedule that.', bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function scheduleWeek(days: PlannedDay[], brand: PostBrand) {
    if (busy || picked.length === 0) return;
    const todo = days.flatMap((day) => day.posts.map((post) => ({ day, post }))).filter(({ post }) => !items.some((item) => item.label === post.id && item.status !== 'cancelled' && item.status !== 'failed'));
    if (todo.length === 0) {
      setMessage({ text: 'The whole week is already scheduled.', bad: false });
      return;
    }
    setMessage(null);
    try {
      for (let i = 0; i < todo.length; i++) {
        setBusy(`Scheduling ${i + 1} of ${todo.length}…`);
        await schedule(todo[i].day, todo[i].post, brand);
      }
      trackEvent('distribute_downloaded', { source: 'schedule_week' });
      setMessage({ text: `${todo.length} ${todo.length === 1 ? 'post' : 'posts'} scheduled. They go out at the times in the calendar.`, bad: false });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : 'Could not schedule the week.', bad: true });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function postNow(day: PlannedDay, post: PlannedPost, brand: PostBrand) {
    if (busy || picked.length === 0) return;
    setBusy(post.id);
    setMessage(null);
    try {
      const body = await form(day, post, brand);
      if (!body) throw new Error('There is nothing to post.');
      const res = await fetchAuthed('/api/carousel/publish', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { error?: string; results?: Record<string, { ok: boolean; note?: string }> };
      if (!res.ok) throw new Error(data.error || 'Could not post.');
      const results = Object.entries(data.results ?? {});
      const failed = results.filter(([, r]) => !r.ok);
      const name = (id: string) => channels.find((c) => c.id === id)?.label ?? 'a channel';
      if (failed.length === 0) setMessage({ text: `Posted to ${results.length === 1 ? name(results[0][0]) : `${results.length} channels`}.`, bad: false });
      else setMessage({ text: failed.map(([id, r]) => `${name(id)}: ${r.note ?? 'failed'}`).join(' '), bad: true });
      trackEvent('distribute_downloaded', { source: 'post_now' });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : 'Could not post.', bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    await fetchAuthed(`/api/distribute/schedule?id=${id}`, { method: 'DELETE' }).catch(() => null);
    await refresh();
  }

  return { channels, loading, reload, picked, toggle, items, ready, busy, message, scheduleOne, scheduleWeek, postNow, cancel };
}
