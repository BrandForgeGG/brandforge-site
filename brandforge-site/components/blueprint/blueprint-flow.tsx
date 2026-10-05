'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { BlueprintDocument } from '@/lib/blueprint-schema';
import { trackEvent } from '@/lib/funnel-client';
import { BlueprintDocumentView } from './blueprint-document';

// The anonymous blueprint journey (brief 4.10): intake -> one honest loading
// state -> the rendered document -> save gate -> refine. Plain fetch
// throughout: these endpoints are deliberately unauthenticated, and
// fetchAuthed would bounce a signed-out visitor to /login on any hiccup.
//
// Failure keeps the visitor's text (never clear the textarea on an error) and
// a failed run retries against the blueprint that already exists, so retries
// do not litter the table with new drafts.

const IDEA_KEY = 'brandforge:blueprint-idea';
const NOTE_MAX = 500;
const EMAIL_MAX_CHARS = 254;
// Master brief 16: the founder's default gate position. The card renders
// inside the document, right before the Estimate block (brief 4.10).
// Must match the server's fallback in app/api/blueprint/save/route.ts.
const GATE_POSITION = 'before_price';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Stage = 'intake' | 'running' | 'result';

interface RunResponse {
  blueprintId?: string;
  version?: number;
  document?: BlueprintDocument;
  error?: string;
}

interface CurrentResponse extends RunResponse {
  status?: string;
  hasEmail?: boolean;
}

export function BlueprintFlow({
  intakeMinChars,
  intakeMaxChars,
}: {
  intakeMinChars: number;
  intakeMaxChars: number;
}) {
  const [stage, setStage] = useState<Stage>('intake');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [document, setDocument] = useState<BlueprintDocument | null>(null);
  const [version, setVersion] = useState(1);
  const [refineOpen, setRefineOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveEmail, setSaveEmail] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const stageRef = useRef<Stage>('intake');
  const interactedRef = useRef(false);
  const gateTrackedRef = useRef(false);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    trackEvent('blueprint_first_screen');
    try {
      const idea = window.sessionStorage.getItem(IDEA_KEY);
      if (idea) {
        window.sessionStorage.removeItem(IDEA_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the idea stashed on the landing page
        setInput(idea.slice(0, intakeMaxChars));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return link (master brief 6): a visitor holding the session cookie (from
  // /api/blueprint/return or an earlier visit) reopens their saved document
  // instead of an empty intake. A quiet 404 means nothing to restore. The
  // guards keep it from stealing the screen from someone already typing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/blueprint/current');
        const data: CurrentResponse = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || !data.blueprintId || !data.document) return;
        if (stageRef.current !== 'intake' || interactedRef.current) return;
        setBlueprintId(data.blueprintId);
        setDocument(data.document);
        setVersion(data.version ?? 1);
        if (data.hasEmail) setSaveState('sent');
        setStage('result');
      } catch {
        // Nothing to restore, or storage unreachable: intake stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The gate impression: once per result screen (refined documents update in
  // place and must not recount).
  useEffect(() => {
    if (stage === 'result' && document && !gateTrackedRef.current) {
      gateTrackedRef.current = true;
      trackEvent('blueprint_gate_shown', { gate: GATE_POSITION });
    }
  }, [stage, document]);

  async function runExisting(id: string): Promise<BlueprintDocument> {
    const response = await fetch('/api/blueprint/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprintId: id }),
    });
    const data: RunResponse = await response.json().catch(() => ({}));
    if (!response.ok || !data.document) {
      throw new Error(data.error || 'Could not draft the blueprint. Try again.');
    }
    setVersion(data.version ?? 1);
    return data.document;
  }

  async function draft() {
    const trimmed = input.trim();
    if (trimmed.length < intakeMinChars || busy) {
      setError(`Describe the problem in at least ${intakeMinChars} characters.`);
      return;
    }
    if (trimmed.length > intakeMaxChars) {
      setError(`Keep the description under ${intakeMaxChars} characters.`);
      return;
    }

    setBusy(true);
    setStage('running');
    setError('');

    try {
      let id = blueprintId;
      if (!id) {
        const response = await fetch('/api/blueprint/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        });
        const data: RunResponse = await response.json().catch(() => ({}));
        if (!response.ok || !data.blueprintId) {
          throw new Error(data.error || 'Could not start a blueprint. Try again.');
        }
        id = data.blueprintId;
        setBlueprintId(id);
      }

      const doc = await runExisting(id);
      setDocument(doc);
      setStage('result');
      setRefineOpen(false);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setStage('intake');
    } finally {
      setBusy(false);
    }
  }

  async function applyRefine() {
    if (!blueprintId || !note.trim() || busy) return;
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3 || trimmedNote.length > NOTE_MAX) {
      setError(`Tell us what to change in 3–${NOTE_MAX} characters.`);
      return;
    }

    trackEvent('blueprint_exit_tapped', { source: 'refine' });
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/blueprint/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId, note: trimmedNote }),
      });
      const data: RunResponse = await response.json().catch(() => ({}));
      if (!response.ok || !data.document) {
        throw new Error(data.error || 'That change could not be applied. Try again.');
      }
      setDocument(data.document);
      setVersion(data.version ?? version + 1);
      setRefineOpen(false);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function saveBlueprint(event: React.FormEvent) {
    event.preventDefault();
    if (!blueprintId || saveState !== 'idle' || busy) return;
    const trimmed = saveEmail.trim().toLowerCase();
    if (trimmed.length > EMAIL_MAX_CHARS || !EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address so the link has somewhere to go.');
      return;
    }

    setSaveState('sending');
    setError('');

    try {
      const response = await fetch('/api/blueprint/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId, email: trimmed, gate: GATE_POSITION }),
      });
      const data: { ok?: boolean; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Could not send the link. Try again.');
      }
      setSaveState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link. Try again.');
      setSaveState('idle');
    }
  }

  function startOver() {
    setStage('intake');
    setBlueprintId(null);
    setDocument(null);
    setVersion(1);
    setInput('');
    setError('');
    setRefineOpen(false);
    setNote('');
    setSaveEmail('');
    setSaveState('idle');
    interactedRef.current = false;
    gateTrackedRef.current = false;
  }

  if (stage === 'result' && document) {
    // The save gate (master brief 4.10): one field, terms visible, positioned
    // `before_price` — passed into the document so it lands right before the
    // Estimate block. Lanes without an estimate get it after the roadmap.
    const gateCard = (
      <div className="rounded-2xl border border-line bg-panel p-6">
        {saveState === 'sent' ? (
          <div>
            <p className="text-sm font-semibold text-foreground">
              Return link sent{saveEmail ? ` to ${saveEmail}` : ''}.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Open it any time to come back to this blueprint — no account needed. To keep it
              with your account,{' '}
              <Link
                href="/login?next=%2Fblueprint"
                className="text-copper underline underline-offset-2 transition hover:text-foreground"
              >
                sign in with the same address
              </Link>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={saveBlueprint}>
            <label htmlFor="save-email" className="text-sm font-semibold text-foreground">
              Save this blueprint
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Send yourself a return link — open it any time, no account needed.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                id="save-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={saveEmail}
                onChange={(e) => setSaveEmail(e.target.value)}
                placeholder="you@company.com"
                maxLength={EMAIL_MAX_CHARS}
                className="w-full max-w-xs rounded-xl border border-line bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted outline-none transition focus:border-ember focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <button
                type="submit"
                disabled={saveState === 'sending' || busy || !saveEmail.trim()}
                className="rounded-lg bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveState === 'sending' ? 'Sending…' : 'Email me a return link'}
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              By continuing you agree to our{' '}
              <Link
                href="/terms"
                className="text-copper underline underline-offset-2 transition hover:text-foreground"
              >
                Terms
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-copper underline underline-offset-2 transition hover:text-foreground"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        )}
      </div>
    );

    return (
      <div className="mt-10">
        {error ? (
          <div className="mb-6 rounded-2xl border border-ember/30 bg-ember/10 p-5" role="alert">
            <p className="text-sm leading-relaxed text-ember-light">{error}</p>
            <button
              type="button"
              onClick={() => setError('')}
              className="mt-3 rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className={`space-y-6 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-copper">Your blueprint</p>
            <p className="text-xs text-muted">
              {version > 1 ? `Version ${version}` : 'First draft'} · from your description alone
            </p>
          </div>

          <BlueprintDocumentView document={document} beforeEstimate={gateCard} />

          <div className="rounded-2xl border border-line bg-panel p-6">
            {refineOpen ? (
              <div>
                <label htmlFor="refine-note" className="text-sm font-semibold text-foreground">
                  What should change?
                </label>
                <textarea
                  id="refine-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={NOTE_MAX}
                  rows={3}
                  placeholder="For example: assume no native app, and make the timeline tighter."
                  className="mt-2 w-full resize-none rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground placeholder-muted outline-none transition focus:border-ember focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={applyRefine}
                    disabled={busy || note.trim().length < 3}
                    className="rounded-lg bg-ember px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Applying…' : 'Apply change'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefineOpen(false)}
                    disabled={busy}
                    className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:border-ember hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <span className="text-xs text-muted">{note.length}/{NOTE_MAX}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Not quite right?</p>
                  <p className="text-xs text-muted">Tell it what to change — same rules, new version.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRefineOpen(true)}
                    disabled={busy}
                    className="rounded-lg bg-ember px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
                  >
                    Refine this blueprint
                  </button>
                  <button
                    type="button"
                    onClick={startOver}
                    disabled={busy}
                    className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:border-ember hover:text-foreground"
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'running') {
    return (
      <div className="mt-10 rounded-2xl border border-line bg-panel p-8" role="status" aria-live="polite">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember [animation-delay:300ms]" />
        </div>
        <p className="mt-4 font-serif text-xl text-foreground">Drafting your blueprint…</p>
        <p className="mt-1 text-sm text-muted">
          Reading your description and building the plan — usually about half a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void draft();
        }}
      >
        <label htmlFor="blueprint-intake" className="text-sm font-semibold text-foreground">
          What are you trying to fix or build?
        </label>
        <textarea
          id="blueprint-intake"
          value={input}
          onChange={(e) => {
            interactedRef.current = true;
            setInput(e.target.value);
          }}
          maxLength={intakeMaxChars}
          rows={5}
          placeholder="A few sentences is enough. What is the problem, who has it, and what should be different when it works?"
          className="mt-2 w-full resize-none rounded-2xl border border-line bg-panel px-5 py-4 text-base text-foreground placeholder-muted outline-none transition focus:border-ember focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {/* Plain integers on purpose: toLocaleString() differs between server
              and client locales and would hydrate-mismatch on the counter. */}
          <span className="text-xs text-muted">{input.length} / {intakeMaxChars} characters</span>
          <button
            type="submit"
            disabled={busy || input.trim().length < intakeMinChars}
            className="rounded-lg bg-ember px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            Draft my blueprint →
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-2xl border border-ember/30 bg-ember/10 p-5" role="alert">
          <p className="text-sm leading-relaxed text-ember-light">{error}</p>
          <button
            type="button"
            onClick={() => void draft()}
            disabled={busy}
            className="mt-3 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        No account, no email, nothing stored beyond this browser session. The blueprint is drafted
        from your words only — we do not invent customers, revenue or research.
      </p>
    </div>
  );
}
