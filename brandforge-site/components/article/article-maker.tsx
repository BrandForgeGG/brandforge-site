'use client';

import { useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';
import { articleMarkdown, articleText, wordCount, type Article } from '@/lib/article.js';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const chip = 'rounded-full border px-3 py-1.5 text-xs transition';
const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember';

function save(text: string, name: string, type: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Article on Create: a topic in, a long-form piece out (title, sections, closing), to copy into LinkedIn, a blog or a
// newsletter, or to download as Markdown or a web page.
export function ArticleMaker() {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [length, setLength] = useState<'short' | 'normal' | 'long'>('normal');
  const [article, setArticle] = useState<Article | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function write() {
    if (topic.trim().length < 8) {
      setError('Say what the article is about in a sentence or two.');
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/create/article', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: topic.trim(), audience: audience.trim(), length }) });
      const data = (await res.json().catch(() => ({}))) as { article?: Article; error?: string };
      if (!res.ok || !data.article) throw new Error(data.error || 'The article could not be written. Try again.');
      setArticle(data.article);
      trackEvent('create_interest', { status: 'article' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The article could not be written.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!article) return;
    try {
      await navigator.clipboard.writeText(articleText(article));
      setNote('Copied. Paste it into LinkedIn, your blog or your newsletter.');
    } catch {
      setNote('Could not copy. Select the text and copy it.');
    }
  }

  function html(a: Article): string {
    const body = [`<h1>${escape(a.title)}</h1>`, a.dek ? `<p><em>${escape(a.dek)}</em></p>` : '', ...a.sections.flatMap((section) => [`<h2>${escape(section.heading)}</h2>`, ...section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`)]), a.closing ? `<p>${escape(a.closing)}</p>` : ''].join('\n');
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(a.title)}</title><style>body{max-width:680px;margin:48px auto;padding:0 20px;font:18px/1.65 Georgia,serif;color:#1a1714}h1{font-size:2.1em;line-height:1.15}h2{margin-top:1.6em}</style></head><body>\n${body}\n</body></html>\n`;
  }

  return (
    <div className="space-y-6">
      <section aria-label="What is the article about" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <label htmlFor="article-topic" className="font-serif text-lg text-foreground">What is the article about?</label>
        <textarea id="article-topic" value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} maxLength={1500} placeholder="The topic, the point you want to make, and anything true it should mention." className={`${field} mt-2 text-base`} />
        <input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={120} placeholder="Who is it for? (optional)" aria-label="Who the article is for" className={`${field} mt-2`} />
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Length">
          {(['short', 'normal', 'long'] as const).map((id) => (
            <button key={id} type="button" aria-pressed={length === id} onClick={() => setLength(id)} className={`${chip} ${length === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {id === 'short' ? 'Short' : id === 'normal' ? 'Normal' : 'Long'}
            </button>
          ))}
          <button type="button" onClick={() => void write()} disabled={busy} className="ml-auto rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
            {busy ? 'Writing…' : article ? 'Write it again' : 'Write the article'}
          </button>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </section>

      {article ? (
        <section aria-label="Your article" className="rounded-2xl border border-line bg-panel p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copy()} className={btn}>Copy the text</button>
            <button type="button" onClick={() => save(articleMarkdown(article), 'brandforge-article.md', 'text/markdown')} className={btn}>Download Markdown</button>
            <button type="button" onClick={() => save(html(article), 'brandforge-article.html', 'text/html')} className={btn}>Download web page</button>
            <span className="ml-auto text-xs text-muted">{wordCount(article)} words</span>
          </div>
          {note ? <p role="status" className="mb-3 text-xs text-muted">{note}</p> : null}
          <article className="mx-auto max-w-2xl">
            <h2 className="font-serif text-3xl leading-tight text-foreground">{article.title}</h2>
            {article.dek ? <p className="mt-2 text-lg italic text-muted">{article.dek}</p> : null}
            {article.sections.map((section) => (
              <div key={section.heading} className="mt-6">
                <h3 className="font-serif text-xl text-foreground">{section.heading}</h3>
                {section.paragraphs.map((paragraph, i) => (
                  <p key={i} className="mt-2 leading-relaxed text-foreground/90">{paragraph}</p>
                ))}
              </div>
            ))}
            {article.closing ? <p className="mt-6 leading-relaxed text-foreground/90">{article.closing}</p> : null}
          </article>
        </section>
      ) : null}
    </div>
  );
}
