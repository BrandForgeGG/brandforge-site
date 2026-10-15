'use client';

import { useState } from 'react';
import { articleMarkdown, articleText, wordCount } from '@/lib/article.js';
import type { ArticleFields } from '@/lib/video-embed.js';
import { openMaker } from '@/components/chat/maker-chat-card';
import { useCreationChat } from '@/components/chat/creation-context';

export type ArticleEmbed = { type: 'article'; id: string } & ArticleFields;

const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember';

// An article written in this chat, as a message: one version of it. Read it, copy it, download it, or open it again in
// the maker to rewrite it (the new version lands underneath).
export function ArticleMessageCard({ embed, createdAt }: { embed: ArticleEmbed; createdAt: string | null }) {
  const { isOwner } = useCreationChat();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { article } = embed;
  const shown = open ? article.sections : article.sections.slice(0, 1);

  async function copy() {
    try {
      await navigator.clipboard.writeText(articleText(article));
      setNote('Copied. Paste it into LinkedIn, your blog or your newsletter.');
    } catch {
      setNote('Copying is blocked here. Download it instead.');
    }
  }

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([articleMarkdown(article)], { type: 'text/markdown' }));
    a.download = `${article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'article'}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return (
    <article className="w-full max-w-2xl rounded-2xl border border-line bg-panel p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Article · {wordCount(article)} words{createdAt ? ` · ${new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
      </p>
      <h3 className="mt-1 font-serif text-xl leading-snug text-foreground">{article.title}</h3>
      {article.dek ? <p className="mt-1 text-sm text-muted">{article.dek}</p> : null}
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
        {shown.map((section, i) => (
          <section key={i}>
            {section.heading ? <h4 className="font-semibold text-foreground">{section.heading}</h4> : null}
            {section.paragraphs.map((paragraph, j) => (
              <p key={j} className="mt-1">{paragraph}</p>
            ))}
          </section>
        ))}
        {open && article.closing ? <p className="italic text-muted">{article.closing}</p> : null}
      </div>
      {article.sections.length > 1 ? (
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 text-xs text-ember hover:underline">
          {open ? 'Show less' : `Read all ${article.sections.length} sections`}
        </button>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isOwner ? (
          <button type="button" onClick={() => openMaker('article', { topic: embed.topic, audience: embed.audience, length: embed.length, article })} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-on-ember transition hover:opacity-90">
            Rewrite
          </button>
        ) : null}
        <button type="button" onClick={() => void copy()} className={btn}>Copy</button>
        <button type="button" onClick={download} className={btn}>Download</button>
      </div>
      {note ? <p role="status" className="mt-2 text-xs text-muted">{note}</p> : null}
    </article>
  );
}
