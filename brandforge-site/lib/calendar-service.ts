import { addDays, buildWeekRows, mondayOf } from '@/lib/content-calendar.js';
import { fallbackCaptions } from '@/lib/carousel-captions.js';
import { makeCarouselPlan } from '@/lib/carousel-service';
import { renderCarouselWithCover } from '@/lib/carousel-server';
import { postToOwnChannels } from '@/lib/carousel-publish';
import { BRAND, CLOSING_LINE } from '@/lib/carousel-bots';
import type { CarouselPlan } from '@/lib/carousel-plan.js';
import {
  claimCalendarPost,
  getCalendarAutoPost,
  getCalendarPost,
  getCalendarPrefs,
  insertCalendarRows,
  listCalendarPosts,
  listDueCalendarPosts,
  recentCalendarTopics,
  updateCalendarPost,
  type CalendarPost,
} from '@/lib/project-db';

// The weekly calendar's engine: make sure a week has its 35 rows, write the carousel for a row, and
// post a row to BrandForge's own channels. Nothing is posted until a person approves it, unless they
// switch automatic posting on.

export async function ensureWeek(mondayIso: string): Promise<CalendarPost[]> {
  const [prefs, used] = await Promise.all([getCalendarPrefs(), recentCalendarTopics()]);
  await insertCalendarRows(buildWeekRows(mondayIso, prefs, used));
  return listCalendarPosts(mondayIso, addDays(mondayIso, 6));
}

// Writes the carousel and its caption for one post. News posts search the web first (inside the planner).
export async function writePost(post: CalendarPost): Promise<CalendarPost | null> {
  const result = await makeCarouselPlan({ mode: 'words', type: post.type, topic: post.topic, cta: CLOSING_LINE, count: 7 });
  if (!result.ok) return updateCalendarPost(post.id, { error: result.error, attempts: post.attempts + 1 });
  const caption = fallbackCaptions(result.plan, CLOSING_LINE).facebook;
  return updateCalendarPost(post.id, { plan: result.plan, caption, status: post.status === 'planned' ? 'ready' : post.status, error: null });
}

export async function writeDay(dateIso: string): Promise<CalendarPost[]> {
  const day = (await listCalendarPosts(dateIso, dateIso)).filter((p) => p.status === 'planned');
  await Promise.all(day.map((post) => writePost(post)));
  return listCalendarPosts(dateIso, dateIso);
}

export async function renderPost(post: CalendarPost): Promise<Buffer[] | null> {
  if (!post.plan) return null;
  return renderCarouselWithCover({ plan: post.plan as CarouselPlan, theme: post.theme, seed: post.id, brand: BRAND }, { style: 'photo', cacheKey: post.id });
}

// Posts one carousel to BrandForge's own channels and records exactly what happened on each.
export async function publishPost(id: string): Promise<CalendarPost | null> {
  const post = await getCalendarPost(id);
  if (!post || post.status === 'posted' || post.status === 'skipped') return post;
  if (!(await claimCalendarPost(id, ['planned', 'ready', 'approved', 'failed'], 'posting'))) return getCalendarPost(id);

  let current: CalendarPost = { ...post, status: 'posting' };
  if (!current.plan) {
    const written = await writePost(current);
    if (!written || !written.plan) {
      await updateCalendarPost(id, { status: 'failed', attempts: post.attempts + 1, error: written?.error ?? 'The carousel could not be written.' });
      return getCalendarPost(id);
    }
    current = { ...written, status: 'posting' };
  }
  const images = await renderPost(current);
  if (!images) {
    await updateCalendarPost(id, { status: 'failed', attempts: post.attempts + 1, error: 'The slides could not be drawn.' });
    return getCalendarPost(id);
  }
  const results = await postToOwnChannels(images, current.caption);
  const anyOk = Object.values(results).some((r) => r.ok);
  return updateCalendarPost(id, {
    status: anyOk ? 'posted' : 'failed',
    results,
    attempts: post.attempts + 1,
    error: anyOk ? null : Object.entries(results).map(([k, r]) => `${k}: ${r.note ?? 'failed'}`).join(' | '),
  });
}

// The scheduler's tick: post whatever is due (approved posts, or everything when automatic posting is
// on), a couple at a time so one run stays well inside the time limit.
export async function runDuePosts(): Promise<{ posted: number; failed: number }> {
  const auto = await getCalendarAutoPost();
  // With automatic posting on, the current week always has its rows, so the next slot is never missing.
  if (auto) await ensureWeek(mondayOf(new Date()));
  let posted = 0;
  let failed = 0;
  for (const post of await listDueCalendarPosts(auto, 2)) {
    const result = await publishPost(post.id);
    if (result?.status === 'posted') posted += 1;
    else failed += 1;
  }
  return { posted, failed };
}
