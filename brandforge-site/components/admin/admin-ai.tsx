'use client';

import { useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Model = { provider: string; name: string; tier: string; status: 'available' | 'not_yet' | 'unknown'; routeId: string | null };
type AiInfo = {
  answering: string;
  fastModel: string;
  liveListRead: boolean;
  models: Model[];
  limits: { userDaily: number; alertAt: number; hardCap: number };
  aiToday: number;
  journey: { event: string; label: string; count: number }[];
  returns: { eligible: number; returned: number; rate: number | null };
};

const STATUS_LABEL: Record<Model['status'], string> = { available: 'Available', not_yet: 'Not yet available', unknown: 'Unknown' };

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-foreground">{title}</h2>
        {note ? <p className="text-xs text-muted">{note}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Models by provider with live availability, today's AI spend guard, the visitor journey with
// step-to-step conversion, and the 7-day return rate.
export function AdminAi() {
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchAuthed('/api/admin/ai')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad'))))
      .then((data: AiInfo) => {
        if (live) setInfo(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) return <p className="text-sm text-muted">AI details could not load.</p>;
  if (!info) return <p className="text-sm text-muted">Loading AI details…</p>;

  const providers = [...new Set(info.models.map((m) => m.provider))];
  const pct = Math.min(100, Math.round((info.aiToday / info.limits.hardCap) * 100));
  const shown = info.journey.filter((step, i) => step.count > 0 || i < 2);

  return (
    <div className="space-y-8">
      <Block title="AI answers" note={`Answering with ${info.answering}. Background steps use ${info.fastModel}.`}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <div key={provider}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{provider}</p>
              <ul className="mt-1.5 space-y-1">
                {info.models
                  .filter((m) => m.provider === provider)
                  .map((m) => (
                    <li key={m.name} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-foreground">{m.name}</span>
                      <span className={m.status === 'available' ? 'shrink-0 text-xs text-success' : 'shrink-0 text-xs text-muted'}>
                        {m.routeId === info.answering ? 'In use' : STATUS_LABEL[m.status]}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        {!info.liveListRead ? <p className="mt-3 text-xs text-muted">OpenRouter&apos;s model list could not be read just now, so availability shows as unknown.</p> : null}
        <p className="mt-3 text-xs text-muted">A model shows as available only when OpenRouter lists it today. &ldquo;Watching&rdquo; rows are models we expect to arrive. Pin one with OPENROUTER_MODEL_QUALITY in Vercel.</p>
      </Block>

      <Block title="AI spend guard" note="Counts AI replies per UTC day">
        <div className="max-w-xl">
          <div className="flex items-baseline justify-between text-sm">
            <span className="tabular-nums text-foreground">{info.aiToday} replies today</span>
            <span className="text-xs text-muted">stops at {info.limits.hardCap}</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-overlay"
            role="progressbar"
            aria-valuenow={info.aiToday}
            aria-valuemin={0}
            aria-valuemax={info.limits.hardCap}
            aria-label="AI replies today against the daily ceiling"
          >
            <div className={pct >= 100 ? 'h-full bg-danger' : 'h-full bg-ember'} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Staff get a message at {info.limits.alertAt}. Each account can send {info.limits.userDaily} a day. Change with AI_DAILY_ALERT, AI_USER_DAILY_LIMIT and AI_DAILY_HARD_CAP.
          </p>
        </div>
      </Block>

      <Block title="Visitor journey" note="Real users, all time">
        <ol className="max-w-xl divide-y divide-line">
          {shown.map((step, i) => {
            const prev = i > 0 ? shown[i - 1].count : 0;
            return (
              <li key={step.event} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="text-muted">{step.label}</span>
                <span className="tabular-nums text-foreground">
                  {step.count}
                  {i > 0 && prev > 0 ? <span className="ml-2 text-xs text-muted">{Math.round((step.count / prev) * 100)}% of previous</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-foreground">
          7-day return rate:{' '}
          {info.returns.rate === null ? (
            <span className="text-muted">not enough members yet (needs people who joined 7+ days ago)</span>
          ) : (
            <span>
              {Math.round(info.returns.rate * 100)}% <span className="text-muted">({info.returns.returned} of {info.returns.eligible} came back)</span>
            </span>
          )}
        </p>
      </Block>
    </div>
  );
}
