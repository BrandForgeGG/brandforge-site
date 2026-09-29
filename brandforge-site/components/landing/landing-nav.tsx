'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { COMMUNITY_LINKS } from '@/lib/community';

export function LandingNav() {
  const [signedIn, setSignedIn] = useState(false);

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
    <nav className="bf-landing-nav" aria-label="Landing">
      <div className="bf-landing-nav-inner">
        <Link
          href="/"
          className="font-serif text-2xl text-[#ece7de]"
          aria-label="BrandForge home"
        >
          Brand<span className="text-[#e8571e]">Forge</span>
        </Link>

        <div className="hidden items-center gap-6 text-sm text-[#9aa0a6] sm:flex">
          <a href="#services" className="transition hover:text-[#ece7de]">
            Services
          </a>
          <a href="#process" className="transition hover:text-[#ece7de]">
            How it works
          </a>
          <a href="#faq" className="transition hover:text-[#ece7de]">
            Questions
          </a>
          <a href="#community" className="transition hover:text-[#ece7de]">
            Community
          </a>
        </div>

        <div className="flex items-center gap-3">
          {signedIn ? (
            <Link
              href="/chat"
              className="rounded-xl bg-[#e8571e] px-4 py-2 text-sm font-semibold text-[#14171a] transition hover:opacity-95"
            >
              Open the app
            </Link>
          ) : (
            <>
              <a
                href={COMMUNITY_LINKS.discord.href}
                target="_blank"
                rel="noreferrer"
                className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-[#ece7de] transition hover:border-[#e8571e] sm:inline-block"
              >
                Join Discord
              </a>
              <Link
                href="/login"
                className="rounded-xl bg-[#e8571e] px-4 py-2 text-sm font-semibold text-[#14171a] transition hover:opacity-95"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
