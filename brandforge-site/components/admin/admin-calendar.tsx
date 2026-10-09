'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Post = {
  id: string;
  post_date: string;
  slot: number;
  scheduled_at: string;
  type: string;
  topic: string;
  theme: string;
  status: 'planned' | 'ready' | 'approved' | 'posting' | 'posted' | 'failed' | 'skipped';
  hasPlan: boolean;
  caption: string;
  results: Record<string, { ok: boolean; note?: string }>;
  error: string | null;
};
type Data = {
  monday: string;
  posts: Post[];
  prefs: { weekday: number; slots: { time?: string; type?: string }[] }[];
  defaults: { weekday: number; name: string; focus: string; types: string[]; times: string[] }[];
  postTypes: string[];
  looks: { id: string; label: string }[];
  autoPost: boolean;
  channels: { telegram: boolean; discord: boolean };
};

const btn = 'rounded-lg border border-line px-2.5 py-1 text-xs text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50';
const input = 'w-full rounded-md border border-line bg-background px-2 py-1 text-xs text-foreground';
const TYPE_LABEL: Record<string, string> = { educational: 'Educational', news: 'News', promo: 'Promotional', list: 'List', funny: 'Funny', story: 'Story', explainer: 'Explainer' };
const STATUS_LABEL: Record<Post['status'], string> = { planned: 'Planned', ready: 'Ready to review', approved: 'Approved', posting: 'Posting…', posted: 'Posted', failed: 'Failed', skipped: 'Skipped' };
const STATUS_TONE: Record<Post['status'], string> = { planned: 'text-muted', ready: 'text-foreground', approved: 'text-ember', posting: 'text-muted', posted: 'text-success', failed: 'text-danger', skipped: 'text-muted' };

function shiftWeek(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// BrandForge's own weekly content calendar: five carousels a day, each weekday with its own mix, written
// ahead, reviewed here, and posted to the channels that are really connected. Nothing goes out until
// it is approved, unless automatic posting is switched on.
export function AdminCalendar() {
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ topic: string; type: string; theme: string }>({ topic: '', type: 'list', theme: 'forge' });
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  const [dayDraft, setDayDraft] = useState<{ time: string; type: string }[]>([]);
  const [slide, setSlide] = useState(0);

  const load = useCallback(async (target: string | null) => {
    const res = await fetchAuthed(`/api/admin/calendar${target ? `?week=${target}` : ''}`).catch(() => null);
    if (res && res.ok) {
      const next = (await res.json()) as Data;
      setData(next);
      setWeek(next.monday);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load(null);
  }, [load]);

  async function act(label: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const res = await fetchAuthed('/api/admin/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      setNote(res.ok ? (out.error ? `${label}: ${out.error}` : label) : out.error || 'That did not work.');
      await load(week);
    } finally {
      setBusy(null);
    }
  }

  async function writeWeek() {
    if (!data) return;
    setNote(null);
    for (let i = 0; i < 7; i++) {
      const date = shiftWeek(data.monday, i);
      setBusy(`day-${date}`);
      await fetchAuthed('/api/admin/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_day', date }) }).catch(() => null);
      await load(week);
    }
    setBusy(null);
    setNote('The week is written. Review each post, then approve.');
  }

  if (!data || !week) return <p className="text-sm text-muted">Loading the calendar…</p>;

  const days = Array.from({ length: 7 }, (_, i) => ({ index: i, date: shiftWeek(data.monday, i), def: data.defaults[i] }));
  const ready = data.posts.filter((p) => p.status === 'ready').length;
  const posted = data.posts.filter((p) => p.status === 'posted').length;

  return (
    <section className="border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-foreground">Weekly posts calendar</h2>
        <p className="text-xs text-muted">5 carousels a day · {posted} posted · {ready} waiting for review · times are UTC</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => void load(shiftWeek(week, -7))} aria-label="Previous week">‹</button>
        <span className="text-sm text-foreground">Week of {new Date(`${week}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
        <button type="button" className={btn} onClick={() => void load(shiftWeek(week, 7))} aria-label="Next week">›</button>
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void writeWeek()}>Write the week</button>
        <button type="button" className={btn} disabled={busy !== null || ready === 0} onClick={() => void act('Approved.', { action: 'approve_ready', week }, 'approve-all')}>Approve all ready</button>
        <label className="ml-auto flex items-center gap-2 text-xs text-foreground">
          <input type="checkbox" checked={data.autoPost} onChange={(e) => void act(e.target.checked ? 'Automatic posting is on.' : 'Automatic posting is off.', { action: 'auto_post', on: e.target.checked }, 'auto')} />
          Post automatically at the times
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        Posts go to: Telegram {data.channels.telegram ? '(connected)' : '(not connected)'} · Discord {data.channels.discord ? '(connected)' : '(not connected: add a content channel webhook as DISCORD_CONTENT_URL)'}.
        With automatic posting off, only approved posts go out.
      </p>
      {note ? <p role="status" className="mt-2 text-xs text-foreground">{note}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {days.map(({ index, date, def }) => {
          const posts = data.posts.filter((p) => p.post_date === date).sort((a, b) => a.slot - b.slot);
          return (
            <div key={date} className="rounded-2xl border border-line p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{def.name} <span className="font-normal text-muted">{new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></p>
                <span className="flex gap-1.5">
                  <button type="button" className={btn} disabled={busy !== null} onClick={() => void act('Day written.', { action: 'generate_day', date }, `day-${date}`)}>{busy === `day-${date}` ? 'Writing…' : 'Write day'}</button>
                  <button
                    type="button"
                    className={btn}
                    aria-expanded={dayOpen === index}
                    onClick={() => {
                      setDayOpen(dayOpen === index ? null : index);
                      const saved = data.prefs.find((p) => p.weekday === index);
                      setDayDraft(Array.from({ length: 5 }, (_, s) => ({ time: saved?.slots?.[s]?.time ?? def.times[s], type: saved?.slots?.[s]?.type ?? def.types[s] })));
                    }}
                  >
                    Day settings
                  </button>
                </span>
              </div>
              <p className="text-xs text-muted">{def.focus}</p>

              {dayOpen === index ? (
                <div className="mt-2 space-y-1.5 rounded-xl border border-line p-2">
                  <p className="text-xs text-muted">Every {def.name} uses these times and post types.</p>
                  {dayDraft.map((slot, s) => (
                    <div key={s} className="grid grid-cols-[5rem_1fr] gap-2">
                      <input type="time" aria-label={`Time for post ${s + 1}`} className={input} value={slot.time} onChange={(e) => setDayDraft(dayDraft.map((d, k) => (k === s ? { ...d, time: e.target.value } : d)))} />
                      <select aria-label={`Type for post ${s + 1}`} className={input} value={slot.type} onChange={(e) => setDayDraft(dayDraft.map((d, k) => (k === s ? { ...d, type: e.target.value } : d)))}>
                        {data.postTypes.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
                      </select>
                    </div>
                  ))}
                  <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void act('Day settings saved.', { action: 'save_prefs', weekday: index, week: data.monday, slots: dayDraft }, `prefs-${index}`)}>Save</button>
                </div>
              ) : null}

              <ul className="mt-2 space-y-2">
                {posts.map((p) => (
                  <li key={p.id} className="rounded-xl border border-line bg-panel/40 p-2.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="tabular-nums text-muted">{new Date(p.scheduled_at).toISOString().slice(11, 16)}</span>
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{TYPE_LABEL[p.type] ?? p.type}</span>
                      <span className={`ml-auto ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </div>
                    {editing === p.id ? (
                      <div className="mt-1.5 space-y-1.5">
                        <input aria-label="Topic" className={input} value={draft.topic} maxLength={300} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
                        <div className="grid grid-cols-2 gap-1.5">
                          <select aria-label="Type" className={input} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{data.postTypes.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}</select>
                          <select aria-label="Look" className={input} value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>{data.looks.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                        </div>
                        <span className="flex gap-1.5">
                          <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => { void act('Saved.', { action: 'edit', id: p.id, ...draft }, p.id).then(() => setEditing(null)); }}>Save</button>
                          <button type="button" className={btn} onClick={() => setEditing(null)}>Cancel</button>
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-foreground">{p.topic}</p>
                    )}
                    {p.error ? <p className="mt-1 text-xs text-danger">{p.error}</p> : null}
                    {p.status === 'posted' ? <p className="mt-1 text-xs text-muted">{Object.entries(p.results).map(([k, r]) => `${k}: ${r.ok ? 'sent' : r.note ?? 'not sent'}`).join(' · ')}</p> : null}

                    {open === p.id && p.hasPlan ? (
                      <div className="mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- an admin-only generated preview */}
                        <img src={`/api/admin/calendar/preview?id=${p.id}&slide=${slide}`} alt={`Slide ${slide + 1}`} className="w-full rounded-lg border border-line" loading="lazy" />
                        <span className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                          <button type="button" className={btn} disabled={slide === 0} onClick={() => setSlide(slide - 1)}>‹</button>
                          Slide {slide + 1}
                          <button type="button" className={btn} disabled={slide >= 8} onClick={() => setSlide(slide + 1)}>›</button>
                        </span>
                        <p className="mt-1.5 whitespace-pre-line text-xs text-muted">{p.caption}</p>
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!p.hasPlan && p.status !== 'skipped' ? <button type="button" className={btn} disabled={busy !== null} onClick={() => void act('Written.', { action: 'generate_post', id: p.id }, p.id)}>{busy === p.id ? 'Writing…' : 'Write'}</button> : null}
                      {p.hasPlan ? <button type="button" className={btn} onClick={() => { setOpen(open === p.id ? null : p.id); setSlide(0); }}>{open === p.id ? 'Hide' : 'Review'}</button> : null}
                      {p.status === 'ready' || p.status === 'failed' ? <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void act('Approved.', { action: 'approve', id: p.id }, p.id)}>Approve</button> : null}
                      {p.status !== 'posted' && p.status !== 'skipped' && p.status !== 'posting' ? <button type="button" className={btn} disabled={busy !== null} onClick={() => void act('Posted.', { action: 'post_now', id: p.id }, p.id)}>{busy === p.id ? 'Posting…' : 'Post now'}</button> : null}
                      {p.status !== 'posted' && p.status !== 'posting' ? <button type="button" className={btn} onClick={() => { setEditing(p.id); setDraft({ topic: p.topic, type: p.type, theme: p.theme }); }}>Edit</button> : null}
                      {p.status === 'skipped' ? <button type="button" className={btn} disabled={busy !== null} onClick={() => void act('Restored.', { action: 'unskip', id: p.id }, p.id)}>Restore</button> : p.status !== 'posted' && p.status !== 'posting' ? <button type="button" className={btn} disabled={busy !== null} onClick={() => void act('Skipped.', { action: 'skip', id: p.id }, p.id)}>Skip</button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
