'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SignInForm } from '@/components/sign-in-form';

type OpenOptions = { next?: string; reason?: 'save' | 'signin' | 'start' | 'carousel' | 'distribute' };
type LoginApi = { openLogin: (options?: OpenOptions) => void };

const LoginContext = createContext<LoginApi>({
  // Without the provider (tests, isolated renders) fall back to the full page.
  openLogin: (options) => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- provider-less fallback
    if (typeof window !== 'undefined') window.location.assign(`/login${options?.next ? `?next=${encodeURIComponent(options.next)}` : ''}`);
  },
});

export function useLogin(): LoginApi {
  return useContext(LoginContext);
}

const COPY = {
  save: { title: 'Sign in to keep going', line: 'Sign in free and everything here comes with you, so you can bring your team in.' },
  carousel: { title: 'Sign in to edit and download', line: 'Free, no card. Your carousel is saved and waiting for you the moment you are in.' },
  distribute: { title: 'Sign in to schedule or post', line: 'Free, no card. Your carousel and captions are kept for you.' },
  start: { title: 'Sign in to get your answer', line: 'Free, no card. Your idea is kept and ready the moment you are in.' },
  signin: { title: 'Sign in to BrandForge', line: 'New or returning, same buttons. Free to start, no card.' },
} as const;

// A pop-up in place of the login page: the chat stays right behind it, and the current address is
// where you land after signing in.
export function LoginProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<OpenOptions | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Portal target only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag for createPortal
    setMounted(true);
  }, []);

  const openLogin = useCallback((options: OpenOptions = {}) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(options);
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panelRef.current?.querySelector<HTMLElement>('button, input, a');
    first?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        return;
      }
      // Keep keyboard focus inside the pop-up.
      if (event.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]'));
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const api = useMemo(() => ({ openLogin }), [openLogin]);
  const copy = COPY[open?.reason ?? 'signin'];
  const next = open?.next ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/chat');

  return (
    <LoginContext.Provider value={api}>
      {children}
      {mounted && open
        ? createPortal(
            <div
              className="bf-login-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="login-title" className="bf-login-panel relative w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-2xl">
                <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-2 text-muted transition hover:bg-overlay hover:text-foreground">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
                <p className="font-serif text-lg text-foreground">
                  Brand<span className="text-ember">Forge</span>
                </p>
                <h2 id="login-title" className="mt-4 font-serif text-2xl tracking-[-0.02em] text-foreground">
                  {copy.title}
                </h2>
                <p className="mt-2 mb-5 text-sm leading-relaxed text-muted">{copy.line}</p>
                <SignInForm next={next} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </LoginContext.Provider>
  );
}
