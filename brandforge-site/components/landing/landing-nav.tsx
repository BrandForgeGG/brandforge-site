'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { BrandMark } from '@/components/brand-mark';

// Four places, nothing else: what you can do, and what it costs.
const NAV_LINKS = [
  { label: 'Work', href: '/work' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Create', href: '/create' },
  { label: 'Trade', href: '/trade' },
];

export function LandingNav() {
  const { openLogin } = useLogin();
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getSessionUser().then((user) => {
      if (!cancelled) {
        setSignedIn(Boolean(user));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="bf-landing-nav relative" aria-label="Landing">
      <div className="bf-landing-nav-inner">
        <Link
          href="/"
          className="text-2xl"
          aria-label="BrandForge home"
        >
          <BrandMark size={32} />
        </Link>

        <div className="hidden items-center gap-6 text-sm text-muted sm:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-foreground">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {signedIn ? (
            <Link
              href="/chat"
              className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-95"
            >
              Open the app
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openLogin({ reason: 'signin', next: '/chat' })}
                className="hidden text-sm font-medium text-muted transition hover:text-foreground sm:inline"
              >
                Sign in
              </button>
              <Link
                href="/chat"
                className="whitespace-nowrap rounded-xl bg-ember px-3 py-2 text-sm font-semibold text-on-ember transition hover:opacity-95 sm:px-4"
              >
                <span className="sm:hidden">Talk to us</span>
                <span className="hidden sm:inline">Talk to the team</span>
              </Link>
            </>
          )}
          {/* Phones: the section links live behind a 44px menu button. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-foreground transition hover:border-ember sm:hidden"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" fill="none">
              {menuOpen ? (
                <>
                  <path d="M2 2l14 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M16 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <path d="M1 1.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M1 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M1 12.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>

        {menuOpen ? (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-line bg-background px-6 py-4 shadow-lg sm:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-3 text-base text-foreground transition hover:bg-panel-2"
                >
                  {link.label}
                </a>
              ))}
              {signedIn ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openLogin({ reason: 'signin', next: '/chat' });
                  }}
                  className="rounded-lg px-2 py-3 text-left text-base text-foreground transition hover:bg-panel-2"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
