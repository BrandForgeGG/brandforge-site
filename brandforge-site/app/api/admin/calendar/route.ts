import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import {
  getCalendarAutoPost,
  getCalendarPost,
  getCalendarPrefs,
  isAdminAccount,
  listCalendarPosts,
  saveCalendarPrefs,
  setCalendarAutoPost,
  updateCalendarPost,
} from '@/lib/project-db';
import { ensureWeek, publishPost, writeDay, writePost } from '@/lib/calendar-service';
import { ownChannels } from '@/lib/carousel-publish';
import { DAY_NAMES, DEFAULT_DAYS, POST_TYPES, SLOT_TIMES, addDays, mondayOf, scheduledAt } from '@/lib/content-calendar.js';
import { THEME_LIST } from '@/lib/carousel-render.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  if (!(await isAdminAccount(user.id))) return { error: NextResponse.json({ error: 'Admin access only' }, { status: 403 }) } as const;
  return { user } as const;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET ?week=YYYY-MM-DD: the week (creating its 35 rows if needed), the day preferences, and which
// channels are really connected. Never returns a secret.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const asked = request.nextUrl.searchParams.get('week') ?? '';
  const monday = mondayOf(DATE.test(asked) ? asked : new Date());
  const posts = await ensureWeek(monday);
  const channels = ownChannels();
  return NextResponse.json({
    monday,
    posts: posts.map((p) => ({ ...p, plan: undefined, hasPlan: Boolean(p.plan) })),
    prefs: await getCalendarPrefs(),
    defaults: DEFAULT_DAYS.map((day, i) => ({ weekday: i, name: DAY_NAMES[i], focus: day.focus, types: day.types, times: SLOT_TIMES })),
    postTypes: POST_TYPES,
    looks: THEME_LIST.map((l: { id: string; label: string }) => ({ id: l.id, label: l.label })),
    autoPost: await getCalendarAutoPost(),
    channels: { telegram: Boolean(channels.telegramChatId), discord: Boolean(channels.discordWebhook) },
  });
}

// POST { action, ... }: generate_day, generate_post, approve, approve_ready, skip, unskip, post_now, edit,
// save_prefs, auto_post.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '');
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : '';

  try {
    if (action === 'generate_day') {
      const date = String(body.date ?? '');
      if (!DATE.test(date)) return NextResponse.json({ error: 'A date is needed.' }, { status: 400 });
      await ensureWeek(mondayOf(date));
      await writeDay(date);
      return NextResponse.json({ success: true });
    }
    if (action === 'approve_ready') {
      const monday = String(body.week ?? '');
      if (!DATE.test(monday)) return NextResponse.json({ error: 'A week is needed.' }, { status: 400 });
      let count = 0;
      for (const post of await listCalendarPosts(monday, addDays(monday, 6))) {
        if (post.status === 'ready' && post.plan) {
          await updateCalendarPost(post.id, { status: 'approved' });
          count += 1;
        }
      }
      return NextResponse.json({ success: true, approved: count });
    }
    if (action === 'auto_post') {
      await setCalendarAutoPost(Boolean(body.on));
      return NextResponse.json({ success: true });
    }
    if (action === 'save_prefs') {
      const weekday = Number(body.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return NextResponse.json({ error: 'Unknown day.' }, { status: 400 });
      const slots = (Array.isArray(body.slots) ? body.slots : []).slice(0, 5).map((s) => {
        const slot = (s ?? {}) as Record<string, unknown>;
        return { time: TIME.test(String(slot.time ?? '')) ? String(slot.time) : undefined, type: POST_TYPES.includes(String(slot.type ?? '')) ? String(slot.type) : undefined };
      });
      await saveCalendarPrefs(weekday, slots);
      // Apply to this and later days of that weekday that have not been posted.
      const monday = String(body.week ?? '');
      if (DATE.test(monday)) {
        const date = addDays(monday, weekday);
        for (const post of await listCalendarPosts(date, date)) {
          if (!['planned', 'ready', 'approved', 'failed'].includes(post.status)) continue;
          const slot = slots[post.slot] ?? {};
          const type = slot.type ?? post.type;
          const time = slot.time ?? SLOT_TIMES[post.slot];
          await updateCalendarPost(post.id, { type, scheduled_at: scheduledAt(date, time), ...(type !== post.type ? { status: 'planned', plan: null, caption: '' } : {}) });
        }
      }
      return NextResponse.json({ success: true });
    }

    if (!id) return NextResponse.json({ error: 'Unknown post.' }, { status: 400 });
    const post = await getCalendarPost(id);
    if (!post) return NextResponse.json({ error: 'Unknown post.' }, { status: 404 });

    if (action === 'generate_post') {
      await writePost({ ...post, status: post.status === 'failed' ? 'planned' : post.status });
      return NextResponse.json({ success: true });
    }
    if (action === 'approve') {
      if (!post.plan) await writePost(post);
      await updateCalendarPost(id, { status: 'approved' });
      return NextResponse.json({ success: true });
    }
    if (action === 'skip' || action === 'unskip') {
      await updateCalendarPost(id, { status: action === 'skip' ? 'skipped' : post.plan ? 'ready' : 'planned' });
      return NextResponse.json({ success: true });
    }
    if (action === 'edit') {
      const type = POST_TYPES.includes(String(body.type ?? '')) ? String(body.type) : post.type;
      const topic = String(body.topic ?? post.topic).trim().slice(0, 300) || post.topic;
      const theme = THEME_LIST.some((l: { id: string }) => l.id === body.theme) ? String(body.theme) : post.theme;
      const changed = type !== post.type || topic !== post.topic;
      await updateCalendarPost(id, { type, topic, theme, ...(changed ? { plan: null, caption: '', status: 'planned' } : {}) });
      return NextResponse.json({ success: true });
    }
    if (action === 'post_now') {
      const result = await publishPost(id);
      return NextResponse.json({ success: true, status: result?.status, error: result?.error ?? null, results: result?.results ?? {} });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('Admin calendar error:', error);
    return NextResponse.json({ error: 'That did not work. Try again.' }, { status: 500 });
  }
}
