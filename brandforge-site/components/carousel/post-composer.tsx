'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { ChannelPicker } from '@/components/integrations/channel-picker';
import { LIMITS, TYPES, blueskyPosts, normalizePost, stripMarkup, telegramHtml, type Post, type PostType } from '@/lib/post-types.js';
import type { ChannelKind } from '@/components/integrations/use-channels';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

type Fields = { text: string; question: string; options: string[]; correct: number; explanation: string; parts: string[] };
const EMPTY: Fields = { text: '', question: '', options: ['', '', ''], correct: 0, explanation: '', parts: ['', '', ''] };
const EXAMPLES: Record<PostType, string> = {
  update: 'We just opened a second studio and want to thank our first customers',
  poll: 'Ask my followers which weekday they prefer for live sessions',
  quiz: 'A quiz about how email subject lines affect open rates',
  thread: 'Five lessons from our first year running a small design studio',
};

function toPost(type: PostType, f: Fields): Record<string, unknown> {
  return { type, text: f.text, question: f.question, options: f.options, correct: f.correct, explanation: f.explanation, parts: f.parts };
}

function fromPost(post: Post, current: Fields): Fields {
  if (post.type === 'update') return { ...current, text: post.text };
  if (post.type === 'thread') return { ...current, parts: post.parts };
  if (post.type === 'poll') return { ...current, question: post.question, options: post.options };
  return { ...current, question: post.question, options: post.options, correct: post.correct, explanation: post.explanation };
}

// Previews are close to what each platform shows, not exact: Telegram renders the formatting, Discord
// shows an embed or a poll, and Bluesky shows plain posts (it has no polls, so a question is a post).
function Preview({ post, only }: { post: Post; only?: ChannelKind }) {
  const bsky = blueskyPosts(post);
  const want = (kind: ChannelKind) => !only || only === kind;
  const plain = post.type === 'update' ? stripMarkup(post.text) : post.type === 'thread' ? post.parts.map((p, i) => `${i + 1}/${post.parts.length} ${stripMarkup(p)}`).join('\n\n') : `${post.question}\n\n${post.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}${post.type === 'quiz' ? `\n\nAnswer: ${post.correct + 1}` : ''}`;
  const telegram =
    post.type === 'poll' || post.type === 'quiz' ? null : post.type === 'thread' ? post.parts.map((p, i) => `**${i + 1}/${post.parts.length}** ${p}`).join('\n\n') : post.text;
  const shell = 'rounded-xl border border-line bg-background p-3 text-sm text-foreground';
  const label = 'mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted';
  return (
    <div className={`grid gap-3 ${only ? '' : 'md:grid-cols-3'}`}>
      {only === 'slack' || only === 'tumblr' ? (
        <div>
          <p className={label}>{only === 'slack' ? 'Slack' : 'Tumblr'}</p>
          <div className={shell}><p className="whitespace-pre-wrap break-words">{plain}</p></div>
        </div>
      ) : null}
      <div className={want('telegram') && only !== 'slack' && only !== 'tumblr' ? '' : 'hidden'}>
        <p className={label}>Telegram</p>
        <div className={shell}>
          {telegram !== null ? (
            <p className="whitespace-pre-wrap break-words [&_a]:text-ember" dangerouslySetInnerHTML={{ __html: telegramHtml(telegram) }} />
          ) : (
            <>
              <p className="font-medium">{post.type === 'poll' || post.type === 'quiz' ? post.question : ''}</p>
              <ul className="mt-2 space-y-1.5">
                {(post.type === 'poll' || post.type === 'quiz' ? post.options : []).map((o, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs"><span className={`h-3.5 w-3.5 rounded-full border ${post.type === 'quiz' && post.correct === i ? 'border-success bg-success/30' : 'border-line'}`} aria-hidden="true" />{o}</li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-muted">{post.type === 'quiz' ? 'Quiz' : 'Poll'} · anonymous</p>
            </>
          )}
        </div>
      </div>
      <div className={want('discord') && only !== 'slack' && only !== 'tumblr' ? '' : 'hidden'}>
        <p className={label}>Discord</p>
        <div className={`${shell} border-l-4 border-l-ember`}>
          {post.type === 'poll' || post.type === 'quiz' ? (
            <>
              <p className="font-medium">{post.question}</p>
              <ul className="mt-2 space-y-1">
                {post.options.map((o, i) => (
                  <li key={i} className="rounded-md bg-overlay px-2 py-1 text-xs">{o}</li>
                ))}
              </ul>
              {post.type === 'quiz' ? <p className="mt-2 text-[11px] text-muted">Answer hidden: ||{post.correct + 1}||</p> : null}
            </>
          ) : (
            <p className="whitespace-pre-wrap break-words">{post.type === 'thread' ? post.parts.map((p, i) => `**${i + 1}/${post.parts.length}** ${p}`).join('\n\n') : post.text}</p>
          )}
        </div>
      </div>
      <div className={want('bluesky') && only !== 'slack' && only !== 'tumblr' ? '' : 'hidden'}>
        <p className={label}>Bluesky{bsky.length > 1 ? ` · ${bsky.length} posts` : ''}</p>
        <div className="space-y-2">
          {bsky.slice(0, 3).map((p, i) => (
            <div key={i} className={shell}><p className="whitespace-pre-wrap break-words">{p.text}</p></div>
          ))}
          {bsky.length > 3 ? <p className="text-[11px] text-muted">and {bsky.length - 3} more</p> : null}
        </div>
      </div>
    </div>
  );
}

// Writes and posts the text-first post types: an update, a poll, a quiz or a thread. One sentence gets a
// first draft; everything stays editable; the preview shows each platform; posting goes to the channels
// the person connected.
export function PostComposer({ type, platform, signedIn, onSignIn }: { type: PostType; platform?: ChannelKind; signedIn: boolean | null; onSignIn: () => void }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [topic, setTopic] = useState('');
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'draft' | 'post' | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const checked = useMemo(() => normalizePost(toPost(type, fields)), [type, fields]);
  const picked = Object.entries(chosen).filter(([, on]) => on).map(([id]) => id);
  const set = (change: Partial<Fields>) => setFields((current) => ({ ...current, ...change }));

  async function draft() {
    setBusy('draft');
    setNote(null);
    try {
      const res = await fetch('/api/posts/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, topic }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote({ tone: 'error', text: data.error || 'The writer could not draft that. Try again.' });
      setFields((current) => fromPost(data.post as Post, current));
      trackEvent('carousel_planned', { source: type });
    } catch {
      setNote({ tone: 'error', text: 'Could not reach the writer. Check your connection.' });
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    if (!checked.ok) return;
    setBusy('post');
    setNote(null);
    try {
      const res = await fetch('/api/posts/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post: checked.post, channelIds: picked }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote({ tone: 'error', text: data.error || 'Could not post.' });
      const lines = Object.values(data.results as Record<string, { ok: boolean; note?: string }>);
      const failed = lines.filter((r) => !r.ok);
      setNote(failed.length ? { tone: 'error', text: `${lines.length - failed.length} of ${lines.length} posted. ${failed.map((r) => r.note).filter(Boolean).join(' ')}` } : { tone: 'ok', text: lines.length === 1 ? 'Posted.' : `Posted to ${lines.length} channels.` });
    } catch {
      setNote({ tone: 'error', text: 'Could not post. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  const options = fields.options;
  const setOption = (i: number, value: string) => set({ options: options.map((o, k) => (k === i ? value : o)) });
  const setPart = (i: number, value: string) => set({ parts: fields.parts.map((p, k) => (k === i ? value : p)) });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section aria-label={`Write a ${TYPES[type].label.toLowerCase()}`} className="space-y-4">
        <p className="text-sm text-muted">{TYPES[type].hint}</p>
        <label className="block text-sm text-foreground">
          What is it about?
          <textarea className={`${field} mt-1.5 min-h-20`} value={topic} maxLength={800} onChange={(e) => setTopic(e.target.value)} placeholder={EXAMPLES[type]} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn} disabled={busy !== null || topic.trim().length < 8 || signedIn === false} onClick={() => void draft()}>{busy === 'draft' ? 'Writing…' : 'Write it for me'}</button>
          {signedIn === false ? <button type="button" className="text-xs text-ember underline-offset-2 hover:underline" onClick={onSignIn}>Sign in to use the writer</button> : <span className="text-xs text-muted">Or write it yourself below.</span>}
        </div>

        {type === 'update' ? (
          <label className="block text-sm text-foreground">
            The post
            <textarea className={`${field} mt-1.5 min-h-40`} value={fields.text} maxLength={LIMITS.update} onChange={(e) => set({ text: e.target.value })} placeholder="Say it plainly. Use **double asterisks** for bold. Web addresses become links." />
            <span className="mt-1 block text-right text-xs text-muted">{fields.text.length} / {LIMITS.update}</span>
          </label>
        ) : null}

        {type === 'poll' || type === 'quiz' ? (
          <>
            <label className="block text-sm text-foreground">
              Question
              <input className={`${field} mt-1.5`} value={fields.question} maxLength={LIMITS.question} onChange={(e) => set({ question: e.target.value })} />
            </label>
            <fieldset>
              <legend className="text-sm text-foreground">{type === 'quiz' ? 'Answers (tick the right one)' : 'Answers'}</legend>
              <div className="mt-1.5 space-y-2">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {type === 'quiz' ? <input type="radio" name="correct" aria-label={`Answer ${i + 1} is right`} checked={fields.correct === i} onChange={() => set({ correct: i })} /> : null}
                    <input className={field} value={o} maxLength={LIMITS.option} onChange={(e) => setOption(i, e.target.value)} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`} />
                    {options.length > 2 ? <button type="button" aria-label={`Remove answer ${i + 1}`} className="text-muted hover:text-danger" onClick={() => set({ options: options.filter((_, k) => k !== i), correct: fields.correct >= i && fields.correct > 0 ? fields.correct - 1 : fields.correct })}>✕</button> : null}
                  </div>
                ))}
              </div>
              {options.length < LIMITS.maxOptions ? <button type="button" className="mt-2 text-xs text-ember underline-offset-2 hover:underline" onClick={() => set({ options: [...options, ''] })}>Add an answer</button> : null}
            </fieldset>
            {type === 'quiz' ? (
              <label className="block text-sm text-foreground">
                Why it is right <span className="text-muted">(optional)</span>
                <input className={`${field} mt-1.5`} value={fields.explanation} maxLength={LIMITS.explanation} onChange={(e) => set({ explanation: e.target.value })} />
              </label>
            ) : null}
          </>
        ) : null}

        {type === 'thread' ? (
          <fieldset>
            <legend className="text-sm text-foreground">The posts</legend>
            <div className="mt-1.5 space-y-2">
              {fields.parts.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2.5 w-6 shrink-0 text-xs text-muted">{i + 1}</span>
                  <textarea className={`${field} min-h-16`} value={p} maxLength={LIMITS.part} onChange={(e) => setPart(i, e.target.value)} aria-label={`Post ${i + 1}`} />
                  {fields.parts.length > 2 ? <button type="button" aria-label={`Remove post ${i + 1}`} className="mt-2 text-muted hover:text-danger" onClick={() => set({ parts: fields.parts.filter((_, k) => k !== i) })}>✕</button> : null}
                </div>
              ))}
            </div>
            {fields.parts.length < LIMITS.maxParts ? <button type="button" className="mt-2 text-xs text-ember underline-offset-2 hover:underline" onClick={() => set({ parts: [...fields.parts, ''] })}>Add a post</button> : null}
          </fieldset>
        ) : null}
      </section>

      <section aria-label="Preview and post" className="min-w-0 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">How it looks</p>
          <div className="mt-2">
            {checked.ok ? <Preview post={checked.post} only={platform} /> : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{checked.error}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="font-serif text-xl text-foreground">Post it now</p>
          <p className="mb-3 mt-1 text-xs text-muted">{platform ? 'Tick where it should go.' : 'Tick where it should go. Polls and quizzes are real polls on Telegram and Discord. Bluesky has no polls, so it gets the question as a post people reply to.'}</p>
          {signedIn === false ? (
            <button type="button" className={btnPrimary} onClick={onSignIn}>Sign in to post</button>
          ) : (
            <>
              <ChannelPicker kinds={platform ? [platform] : undefined} value={chosen} onChange={setChosen} onNote={(text) => setNote({ tone: 'ok', text })} />
              <button type="button" className={`${btnPrimary} mt-4`} disabled={busy !== null || !checked.ok || picked.length === 0} onClick={() => void post()}>
                {busy === 'post' ? 'Posting…' : picked.length === 0 ? 'Tick a channel to post' : `Post to ${picked.length} channel${picked.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
          {note ? <p role={note.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${note.tone === 'error' ? 'text-danger' : 'text-foreground'}`}>{note.text}</p> : null}
        </div>
      </section>
    </div>
  );
}
