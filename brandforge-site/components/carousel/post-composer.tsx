'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { PublishPanel, TEXT_PLATFORMS } from '@/components/studio/publish-panel';
import { LIMITS, TYPES, normalizePost, stripMarkup, telegramHtml, type Post, type PostType } from '@/lib/post-types.js';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btn = 'rounded-xl border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50';

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

/** The post as plain text, for copying and downloading. */
function toText(post: Post): string {
  if (post.type === 'update') return stripMarkup(post.text);
  if (post.type === 'thread') return post.parts.map((p, i) => `${i + 1}/${post.parts.length} ${stripMarkup(p)}`).join('\n\n');
  const options = post.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
  return `${post.question}\n\n${options}${post.type === 'quiz' ? `\n\nAnswer: ${post.correct + 1}. ${post.options[post.correct]}${post.explanation ? ` (${post.explanation})` : ''}` : ''}`;
}

// A neutral live preview: it shows the post itself, not any platform's frame, and updates as you type.
function LivePreview({ post }: { post: Post }) {
  const card = 'rounded-2xl border border-line bg-background p-4 shadow-md';
  if (post.type === 'update') return <div className={card}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground [&_a]:text-ember" dangerouslySetInnerHTML={{ __html: telegramHtml(post.text) }} /></div>;
  if (post.type === 'thread') {
    return (
      <div className="relative space-y-3 pl-5">
        <span aria-hidden="true" className="absolute bottom-3 left-2 top-3 w-px bg-line" />
        {post.parts.map((part, i) => (
          <div key={i} className={`${card} relative`}>
            <span aria-hidden="true" className="absolute -left-[1.05rem] top-4 h-2.5 w-2.5 rounded-full bg-ember" />
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{part}</p>
            <p className="mt-1.5 text-[11px] text-muted">{i + 1}/{post.parts.length}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={card}>
      <p className="text-sm font-semibold text-foreground">{post.question}</p>
      <ul className="mt-3 space-y-2">
        {post.options.map((option, i) => {
          const right = post.type === 'quiz' && post.correct === i;
          return (
            <li key={i} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${right ? 'border-success bg-success/10 text-foreground' : 'border-line text-foreground'}`}>
              <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${right ? 'border-success bg-success text-background' : 'border-line text-transparent'}`}>✓</span>
              {option}
            </li>
          );
        })}
      </ul>
      {post.type === 'quiz' && post.explanation ? <p className="mt-3 text-xs text-muted">{post.explanation}</p> : null}
    </div>
  );
}

// Makes an update, a poll, a quiz or a thread. One sentence gets a first draft; everything stays
// editable; the preview updates as you type; then the same Publish step as every other format.
export function PostComposer({ type, signedIn, onSignIn }: { type: PostType; signedIn: boolean | null; onSignIn: () => void }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checked = useMemo(() => normalizePost(toPost(type, fields)), [type, fields]);
  const set = (change: Partial<Fields>) => setFields((current) => ({ ...current, ...change }));

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/posts/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, topic }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'The writer could not draft that. Try again.');
      setFields((current) => fromPost(data.post as Post, current));
      trackEvent('carousel_planned', { source: type });
    } catch {
      setError('Could not reach the writer. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const options = fields.options;
  const setOption = (i: number, value: string) => set({ options: options.map((o, k) => (k === i ? value : o)) });
  const setPart = (i: number, value: string) => set({ parts: fields.parts.map((p, k) => (k === i ? value : p)) });

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section aria-label={`Write a ${TYPES[type].label.toLowerCase()}`} className="space-y-4">
          <label className="block text-sm text-foreground">
            What is it about?
            <textarea className={`${field} mt-1.5 min-h-20`} value={topic} maxLength={800} onChange={(e) => setTopic(e.target.value)} placeholder={EXAMPLES[type]} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btn} disabled={busy || topic.trim().length < 8 || signedIn === false} onClick={() => void draft()}>{busy ? 'Writing…' : 'Write it for me'}</button>
            {signedIn === false ? <button type="button" className="text-xs text-ember underline-offset-2 hover:underline" onClick={onSignIn}>Sign in to use the writer</button> : <span className="text-xs text-muted">Or write it yourself below.</span>}
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

          {type === 'update' ? (
            <label className="block text-sm text-foreground">
              The post
              <textarea className={`${field} mt-1.5 min-h-36`} value={fields.text} maxLength={LIMITS.update} onChange={(e) => set({ text: e.target.value })} placeholder="Say it plainly. Use **double asterisks** for bold. Web addresses become links." />
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
                    <span className="mt-2.5 w-5 shrink-0 text-xs text-muted">{i + 1}</span>
                    <textarea className={`${field} min-h-16`} value={p} maxLength={LIMITS.part} onChange={(e) => setPart(i, e.target.value)} aria-label={`Post ${i + 1}`} />
                    {fields.parts.length > 2 ? <button type="button" aria-label={`Remove post ${i + 1}`} className="mt-2 text-muted hover:text-danger" onClick={() => set({ parts: fields.parts.filter((_, k) => k !== i) })}>✕</button> : null}
                  </div>
                ))}
              </div>
              {fields.parts.length < LIMITS.maxParts ? <button type="button" className="mt-2 text-xs text-ember underline-offset-2 hover:underline" onClick={() => set({ parts: [...fields.parts, ''] })}>Add a post</button> : null}
            </fieldset>
          ) : null}
        </section>

        <section aria-label="Preview" className="min-w-0">
          {checked.ok ? <LivePreview post={checked.post} /> : <p className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">{checked.error} Your post shows up here as you write it.</p>}
        </section>
      </div>

      {checked.ok ? <PublishPanel platforms={TEXT_PLATFORMS} copyText={toText(checked.post)} fileName={`${type}.txt`} /> : null}
    </div>
  );
}
