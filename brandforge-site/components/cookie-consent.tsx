'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usageVisitorId } from '@/lib/funnel-client';
import { Analytics } from '@vercel/analytics/next';
import { CONSENT_EVENT, consentCookie, readConsent } from '@/lib/consent.js';

const REOPEN_EVENT = 'bf:consent-reopen';

// One tiny store over document.cookie: the banner and the analytics gate read the same value, and both update the moment
// the visitor chooses. The server snapshot is 'pending' so nothing measures or flashes before the browser has been asked.
let reopened = false;

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener(REOPEN_EVENT, onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener(REOPEN_EVENT, onChange);
  };
}

function snapshot(): string {
  if (reopened) return 'asking';
  return readConsent(document.cookie) ?? 'asking';
}

/** Footer link: opens the choice again so it can be changed any time. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        reopened = true;
        window.dispatchEvent(new Event(REOPEN_EVENT));
      }}
    >
      Cookies
    </button>
  );
}

export function CookieConsent() {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'pending');

  const choose = useCallback((value: 'all' | 'essential') => {
    reopened = false;
    document.cookie = consentCookie(value, window.location.protocol === 'https:');
    if (value === 'essential') {
      try {
        window.localStorage.removeItem('bf_visitor_id');
      } catch {
        // Storage can be blocked; the cookie is what matters.
      }
    }
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }, []);

  // Time on site: once a minute while this tab is open and visible, only after a yes to measurement.
  useEffect(() => {
    if (state !== 'all') return;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const visitorId = usageVisitorId();
      if (!visitorId) return;
      void fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }), keepalive: true }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 300_000);
    return () => window.clearInterval(timer);
  }, [state]);

  return (
    <>
      {state === 'all' ? <Analytics /> : null}
      {state === 'asking' ? (
        <div
          role="dialog"
          aria-label="Cookie choices"
          className="fixed inset-x-3 bottom-3 z-[60] max-w-md rounded-2xl border border-line bg-panel p-4 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:left-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <p className="text-sm font-medium text-foreground">Cookies</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Sign-in and your settings need a few cookies. We would also like to count visits so we can fix what is slow or confusing. Nothing is sold or shared for ads.{' '}
            <a href="/privacy#cookies" className="underline underline-offset-2 hover:text-foreground">
              Details
            </a>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => choose('all')} className="bf-tap rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
              Accept all
            </button>
            <button type="button" onClick={() => choose('essential')} className="bf-tap rounded-full border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5">
              Essential only
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
