'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { relativeTime } from '@/components/conversation-rail';
import { supabase } from '@/lib/supabase';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import {
  GROUPS,
  REFERENCE_FIELD,
  TOOLS,
  compile,
  defaultValues,
  getTool,
  type CreateField,
  type CreateTool,
  type CreateValues,
} from '@/lib/create-tools';

const STORAGE_KEY = 'brandforge:create-studio';

// One small stroke icon per tool, drawn inline so the page has no image requests.
const ICONS: Record<string, string> = {
  image: 'M4 5h12v10H4zM4 13l3.5-3.5 3 3 2-2L16 14M13 8.2h.01',
  video: 'M3.5 6h9v8h-9zM12.5 9l4-2v6l-4-2',
  copy: 'M4 5.5h12M4 9h12M4 12.5h8M4 16h5',
  audit: 'M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM13 13l3.5 3.5',
  strategy: 'M4 15V9M8 15V5M12 15v-4M16 15V7',
  plan: 'M4 4.5h4v4H4zM12 4.5h4v4h-4zM8 6.5h4M6 8.5v4h6M12 12.5h4v3h-4z',
  competitors: 'M6 8a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0zM3.5 16c.4-2.4 2.3-3.8 4.5-3.8s4.1 1.4 4.5 3.8M14 8.2a2 2 0 110 3.6M14.5 12.4c1.2.3 2 1.3 2.2 2.6',
  brand: 'M10 3.5l1.9 4 4.4.6-3.2 3 .8 4.4L10 13.4l-3.9 2.1.8-4.4-3.2-3 4.4-.6z',
};

function ToolIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[id] ?? ICONS.copy} />
    </svg>
  );
}

type Recent = { id: string; title: string; lastActivity: string | null };

function FieldInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: CreateField;
  value: string | string[];
  onChange: (next: string | string[]) => void;
  invalid: boolean;
}) {
  const base =
    'w-full rounded-xl border bg-panel px-3.5 py-2.5 text-[15px] text-foreground placeholder-muted outline-none transition focus:border-ember ' +
    (invalid ? 'border-danger' : 'border-line');

  if (field.type === 'textarea') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-invalid={invalid}
        className={`${base} resize-none`}
      />
    );
  }
  if (field.type === 'text' || field.type === 'url') {
    return (
      <input
        type="text"
        inputMode={field.type === 'url' ? 'url' : undefined}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-invalid={invalid}
        className={base}
      />
    );
  }
  if (field.type === 'chips' || field.type === 'multi') {
    const multi = field.type === 'multi';
    const selected = multi ? (Array.isArray(value) ? value : []) : [String(value ?? '')];
    return (
      <div className="flex flex-wrap gap-1.5" role={multi ? 'group' : 'radiogroup'} aria-label={field.label}>
        {(field.options ?? []).map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              role={multi ? undefined : 'radio'}
              aria-checked={multi ? undefined : on}
              aria-pressed={multi ? on : undefined}
              onClick={() => {
                if (!multi) return onChange(option);
                onChange(on ? selected.filter((item) => item !== option) : [...selected, option]);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                on ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:border-ember/50 hover:text-foreground'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    );
  }
  return null;
}

export function CreateStudio() {
  const router = useRouter();
  const [toolId, setToolId] = useState<string>(TOOLS[0].id);
  const [valuesByTool, setValuesByTool] = useState<Record<string, CreateValues>>({});
  const [override, setOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field: string | null } | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);

  const tool = getTool(toolId) as CreateTool;
  const values = valuesByTool[toolId] ?? defaultValues(tool);
  const group = tool.group;
  const compiled = compile(toolId, values);

  // Remember the last tool and what was typed for this browser session only.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null') as { toolId?: string; values?: Record<string, CreateValues> } | null;
      if (saved?.toolId && getTool(saved.toolId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of this session's draft
        setToolId(saved.toolId);
        setValuesByTool(saved.values ?? {});
      }
    } catch {
      // Storage unavailable: start fresh.
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ toolId, values: valuesByTool }));
    } catch {
      // Draft just will not persist.
    }
  }, [toolId, valuesByTool]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchAuthed('/api/conversations-list');
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !Array.isArray(data.conversations)) return;
        setRecents(
          (data.conversations as Recent[])
            .slice(0, 4)
            .map((item) => ({ id: item.id, title: item.title, lastActivity: item.lastActivity ?? null })),
        );
      } catch {
        // The strip is a convenience.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setValue(key: string, next: string | string[]) {
    setValuesByTool((current) => ({ ...current, [toolId]: { ...(current[toolId] ?? defaultValues(tool)), [key]: next } }));
    setOverride(null);
    setError(null);
  }

  function pickTool(id: string) {
    setToolId(id);
    setOverride(null);
    setError(null);
  }

  function fillExample() {
    setValuesByTool((current) => ({ ...current, [toolId]: { ...defaultValues(tool), ...tool.example } }));
    setOverride(null);
    setError(null);
  }

  async function start() {
    if (busy) return;
    const finalPrompt = override && override.trim().length > 10 ? override.trim() : compiled.ok ? compiled.prompt : null;
    if (!finalPrompt) {
      if (!compiled.ok) setError({ message: compiled.error, field: compiled.field });
      return;
    }
    setBusy(true);
    setError(null);
    trackEvent('chat_started', { source: `studio_${toolId}` });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetchAuthed('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialMessage: finalPrompt, source: `studio_${toolId}`, guest: !session?.user }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.conversationId) {
        throw new Error(data.error || 'Could not start. Try again in a moment.');
      }
      router.push(`/chat?conversationId=${data.conversationId}`);
    } catch (caught) {
      setError({ message: caught instanceof Error ? caught.message : 'Could not start. Try again in a moment.', field: null });
      setBusy(false);
    }
  }

  return (
    <AppShell title="Create" subtitle="Pick a tool, set the options, and it opens in a chat your team can join.">
      <div role="tablist" aria-label="Tool groups" className="flex gap-1 border-b border-line">
        {GROUPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={group === entry.id}
            onClick={() => pickTool(TOOLS.find((item) => item.group === entry.id)!.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              group === entry.id ? 'border-ember text-foreground' : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tool">
        {TOOLS.filter((item) => item.group === group).map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === toolId}
            onClick={() => pickTool(item.id)}
            className={`bf-card flex items-start gap-2.5 p-3 text-left transition ${
              item.id === toolId ? 'border-ember text-ember' : 'text-muted hover:border-ember/40'
            }`}
          >
            <ToolIcon id={item.id} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{item.label}</span>
              <span className="block text-xs leading-snug text-muted">{item.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        {tool.fields.map((field) => (
          <div key={field.key}>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-muted">{field.label}</label>
            <FieldInput
              field={field}
              value={values[field.key] ?? ''}
              onChange={(next) => setValue(field.key, next)}
              invalid={error?.field === field.key}
            />
          </div>
        ))}

        <details className="rounded-xl border border-line bg-panel px-3.5 py-2.5" open={Boolean(values.reference) || override !== null}>
          <summary className="cursor-pointer text-sm text-muted">More options</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-muted">{REFERENCE_FIELD.label}</label>
              <FieldInput
                field={REFERENCE_FIELD}
                value={values.reference ?? ''}
                onChange={(next) => setValue('reference', next)}
                invalid={error?.field === 'reference'}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-muted">The exact request</label>
              <textarea
                value={override ?? (compiled.ok ? compiled.prompt : '')}
                onChange={(event) => setOverride(event.target.value)}
                rows={4}
                aria-label="The exact request"
                className="w-full resize-y rounded-xl border border-line bg-background px-3 py-2 text-xs leading-relaxed text-muted outline-none focus:border-ember focus:text-foreground"
              />
              <p className="mt-1 text-xs text-muted">Edit it if you want to word it yourself. Changing an option above resets it.</p>
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="bf-button bf-button-primary disabled:opacity-50">
            {busy ? 'Starting…' : 'Start →'}
          </button>
          <button type="button" onClick={fillExample} className="text-sm text-muted underline-offset-2 transition hover:text-foreground hover:underline">
            Try an example
          </button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error.message}
            </p>
          ) : null}
        </div>
      </form>

      {recents.length > 0 ? (
        <section className="mt-10" aria-label="Pick up where you left off">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted">Pick up where you left off</p>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-panel">
            {recents.map((item) => (
              <li key={item.id}>
                <Link href={`/chat?conversationId=${item.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition hover:bg-overlay">
                  <span className="min-w-0 truncate text-foreground">{item.title}</span>
                  {item.lastActivity ? <span className="shrink-0 text-xs text-muted">{relativeTime(item.lastActivity)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
