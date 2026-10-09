"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAuthed, getSessionUser } from "@/lib/browser-auth";
import { useLogin } from "@/components/login-dialog";
import { avatarTone, initialsFor } from "@/lib/identity-display";

export interface RecentConversation {
  id: string;
  title: string;
  status: string;
  messageCount: number;
  lastActivity: string | null;
  preview: string | null;
  /** Conversation owner - staff use it to tell their own chats apart from founders' chats. */
  ownerId?: string;
  /** First BrandForge staff member in the chat (founder view). */
  staffViewedAt?: string | null;
  staffViewedBy?: string | null;
  /** Staff view only: nobody from the team has opened this chat yet. */
  isUnseen?: boolean;
  /** AI participation enabled for this conversation (migration 0024). */
  aiEnabled?: boolean;
}

// Recents show real timestamps from persisted messages, never a hardcoded "Just now".

// One small stroke icon per workspace page and for chats, drawn inline (no image requests).
// A browser with no Supabase auth cookie has no account to load: show sign-in instead of an
// account block that would read "Signed in". Server render says "not a visitor" so hydration agrees.
function useIsVisitor(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => !/sb-[^=;]+-auth-token/.test(document.cookie),
    () => false,
  );
}

const NAV_ITEMS = [
  { href: "/create", label: "Create", hint: "Images, video, copy and plans", path: "M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6zM15.5 3v3M14 4.5h3" },
  { href: "/distribute", label: "Distribute", hint: "Ads, calendar and launch plans", path: "M16.5 3.5L8 12M16.5 3.5l-5 13-3.5-4.5-4.5-3.5z" },
  { href: "/optimize", label: "Optimize", hint: "See what works", path: "M4 15V9M8 15V5M12 15v-4M16 15V7" },
  { href: "/trade", label: "Trade", hint: "Hire or get hired", path: "M4 7h11l-3-3M16 13H5l3 3" },
  { href: "/overview", label: "Overview", hint: "What BrandForge is and how it works", path: "M10 3.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM10 9v4.5M10 6.6h.01" },
];
const CHAT_ICON = "M4 5.5h12v7.5H9.5L6 16v-3H4z";

function RailIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function relativeTime(value: string | null): string {
  if (!value) {
    return "no activity";
  }

  const then = new Date(value).getTime();

  if (Number.isNaN(then)) {
    return "no activity";
  }

  const diffMinutes = Math.round((Date.now() - then) / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return diffMinutes + "m ago";
  if (diffMinutes < 60 * 24) return Math.round(diffMinutes / 60) + "h ago";
  if (diffMinutes < 60 * 24 * 7)
    return Math.round(diffMinutes / (60 * 24)) + "d ago";

  return new Date(then).toLocaleDateString();
}

// Where the founder's sidebar width preference lives.
const COLLAPSE_KEY = "brandforge:rail-collapsed";

export function ConversationRail({
  recents: recentsProp,
  activeConversationId = "",
  onNewChat,
  isCreatingConversation = false,
    isMobileOpen,
onMobileClose,
    isStaff: isStaffProp,
    staffUnseenCount: staffUnseenCountProp,
  }: {
    recents?: RecentConversation[];
    activeConversationId?: string;
    onNewChat?: () => void;
    isCreatingConversation?: boolean;
    isMobileOpen: boolean;
    onMobileClose: () => void;
    isStaff?: boolean;
    staffUnseenCount?: number;
  }) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [account, setAccount] = useState<{
    name: string;
    email: string;
    role: string;
    username: string | null;
  } | null>(null);
  const [accountId, setAccountId] = useState("");
  // The readable bf_guest cookie marks an anonymous browser (rail is client-only, no SSR mismatch).
  const isVisitor = useIsVisitor();
  const { openLogin } = useLogin();
  const isGuestBrowser = typeof document !== "undefined" && document.cookie.includes("bf_guest=");
  const [isSelfStaff, setIsSelfStaff] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Remember how wide the founder left the sidebar. Read after mount so the server render and the
  // first client render agree (no hydration mismatch); the flip one frame later is invisible.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(COLLAPSE_KEY);
    } catch {
      stored = null; // storage blocked (private mode) — stay expanded
    }
    // The preference is only ever readable in the browser, so it cannot be part of the server
    // render; applying it here (rather than in a lazy initializer) avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    if (stored === "1") setIsCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setIsCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Storage blocked: the collapse still works for this session.
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const user = await getSessionUser();
      if (cancelled || !user?.email) {
        return;
      }

      const email = user.email;
      const fullName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;

      // The signed-in member's own @handle, when they have picked one. Optional by design:
      // a missing username must never break the rail.
      let username: string | null = null;
      try {
        const response = await fetchAuthed("/api/identity");
        if (response.ok) {
          const data = await response.json();
          username = data?.identity?.username ?? null;
        }
      } catch {
        // Profile nicety only.
      }

      if (cancelled) return;
      setAccountId(user.id);
      setAccount({
        name: fullName?.trim() || email.split("@")[0],
        email,
        role: "user",
        username,
      });
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  const [selfRecents, setSelfRecents] = useState<RecentConversation[] | null>(
    null,
  );

  const loadSelfRecents = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/conversations-list");
      if (!response.ok) return;
      const data = await response.json();
      setSelfRecents(
        Array.isArray(data.conversations) ? data.conversations : [],
      );
      setIsSelfStaff(Boolean(data.isStaff));
      setUnseenCount(Number(data.unseenCount ?? 0));
    } catch {
      // Recents are a convenience feed; a failure must not break the sidebar.
      setSelfRecents([]);
    }
  }, []);

  useEffect(() => {
    if (recentsProp !== undefined || selfRecents !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSelfRecents();
    // Staff need to notice a brand new chat without reloading the page.
    // Hidden tabs skip the poll: nothing on screen can go stale.
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadSelfRecents();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [recentsProp, selfRecents, loadSelfRecents]);

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/stats");
      if (!response.ok) return;
      const data = await response.json();
      // Only the access flags are kept: platform-wide counters no longer render in the rail.
      setIsSelfStaff((current) => current || Boolean(data.isStaff));
      // Admin links follow profiles.role, not the email allowlist: a promoted admin must see them.
      if (data.isAdmin) setIsAdmin(true);
    } catch {
      // Flags are informational only; they must never break the rail.
    }
  }, []);

  useEffect(() => {
    // Initial load: loadCounts is async and only sets state after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCounts();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadCounts();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [loadCounts]);

  const recents = recentsProp ?? selfRecents ?? [];
  const isStaff = isStaffProp ?? isSelfStaff;
  const newChatCount = staffUnseenCountProp ?? unseenCount;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onMobileClose}
          className="fixed inset-0 z-30 cursor-default bg-foreground/60 md:hidden"
        />
      ) : null}

      <aside
        className={
          "bf-rail fixed inset-y-0 left-0 z-40 h-dvh w-72 shrink-0 flex-col border-r border-line bg-deep md:sticky md:top-0 md:h-full md:z-auto md:flex " +
          (isMobileOpen ? "flex" : "hidden") +
          // Collapsed on desktop: a narrow icon rail so the conversation can breathe.
          (isCollapsed ? " md:w-16" : "")
        }
      >
        <div className="bf-rail-header flex shrink-0 items-center justify-between">
          <Link
            href="/"
            onClick={onMobileClose}
            aria-label="BrandForge home"
            className="font-serif text-lg tracking-tight text-foreground"
          >
            {isCollapsed ? (
              <span aria-hidden="true">
                B<span className="text-ember">F</span>
              </span>
            ) : (
              <>
                Brand<span className="text-ember">Forge</span>
              </>
            )}
          </Link>
          {/* Desktop: collapse to the icon rail. Phone: the drawer closes instead; a collapse
              control does nothing there. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-2 text-muted transition hover:bg-overlay hover:text-foreground md:inline-flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-tip={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-tip-pos="right"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={isCollapsed ? "M7 4l6 6-6 6" : "M13 4l-6 6 6 6"} />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMobileClose}
            className="inline-flex rounded-lg p-2 text-muted transition hover:bg-overlay hover:text-foreground md:hidden"
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="shrink-0 p-4">
          <button
            type="button"
            onClick={() => {
              onMobileClose();
              if (onNewChat) {
                onNewChat();
              } else {
                router.push("/chat");
              }
            }}
            disabled={isCreatingConversation}
            aria-label="New chat"
            title="New chat"
            className="bf-new-chat"
          >
            <span className="text-lg leading-none">+</span>
            {isCollapsed
              ? null
              : isCreatingConversation
                ? "Starting..."
                : "New Chat"}
          </button>
        </div>

        <div className={isCollapsed ? "shrink-0 px-2 pb-2" : "shrink-0 px-4 pb-2"}>
          <nav aria-label="Workspace" className={isCollapsed ? "flex flex-col items-center gap-1" : "flex flex-col gap-0.5"}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                data-tip={isCollapsed ? item.label : item.hint}
                data-tip-pos="right"
                aria-label={item.label}
                className={
                  isCollapsed
                    ? "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-overlay hover:text-foreground"
                    : "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-muted transition hover:bg-overlay hover:text-foreground"
                }
              >
                <RailIcon path={item.path} className="h-4 w-4 shrink-0" />
                {isCollapsed ? null : item.label}
              </Link>
            ))}
          </nav>
        </div>

        {isCollapsed ? (
          /* Collapsed rail: recents stay one click away as letter chips with tooltips. */
          <nav
            aria-label="Recent conversations"
            className="bf-rail-scroll flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden px-2 pb-4"
          >
            {recents.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const letter = initialsFor(conversation.title);
              return (
                <Link
                  key={conversation.id}
                  href={"/chat?conversationId=" + conversation.id}
                  onClick={onMobileClose}
                  title={conversation.title}
                  aria-label={conversation.title}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition " +
                    (isActive
                      ? "bg-overlay text-foreground"
                      : "text-muted hover:bg-overlay hover:text-foreground")
                  }
                >
                  {isStaff && conversation.isUnseen ? (
                    <span
                      aria-label="Nobody from the team has opened this chat yet"
                      className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-ember"
                    />
                  ) : null}
                  <span aria-hidden="true">{letter}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        {isCollapsed ? null : (
          <div className="bf-rail-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-4 pb-4">
            {isAdmin ? (
              <section>
                <p className="bf-rail-section-label">Admin</p>
                <div className="flex flex-col gap-1">
                  <Link
                    href="/admin/applications"
                    onClick={onMobileClose}
                    className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-overlay hover:text-foreground"
                  >
                    Applications
                  </Link>
                  <Link
                    href="/admin/funnel"
                    onClick={onMobileClose}
                    className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-overlay hover:text-foreground"
                  >
                    Funnel
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="min-h-0 flex-1">
              <p className="bf-rail-section-label">Recents</p>

              {recents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-3 py-3">
                  <p className="text-sm text-foreground">{isStaff ? 'No briefs yet' : 'No chats yet'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {isStaff
                      ? 'New briefs appear here the moment a founder sends one for review. Link Telegram in Settings and the ping finds you first.'
                      : 'Describe an idea in the message box. Your chat shows up here, ready to pick up on any device.'}
                  </p>
                </div>
              ) : (
                <div className="bf-recents">
                  {recents.map((conversation) => {
                    const isActive = conversation.id === activeConversationId;

                    return (
                      <div
                        key={conversation.id}
                        className={
                          "bf-recent-item " +
                          (isActive ? "bf-recent-item-active" : "")
                        }
                      >
                        <div className="flex items-start gap-2 px-3 py-2">
                          <Link
                            href={"/chat?conversationId=" + conversation.id}
                            onClick={onMobileClose}
                            className="min-w-0 flex-1"
                          >
                            <p className="flex items-center gap-2 text-sm text-foreground">
                              <RailIcon path={CHAT_ICON} className="h-3.5 w-3.5 shrink-0 text-muted" />
                              {isStaff && conversation.isUnseen ? (
                                <span
                                  aria-label="Nobody from the team has opened this chat yet"
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember"
                                />
                              ) : null}
                              <span className="min-w-0 truncate">
                                {conversation.title}
                              </span>
                            </p>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {isCollapsed ? (
          /* Collapsed footer: the account stays reachable as an avatar chip. */
          <div className="bf-rail-footer mt-auto flex shrink-0 justify-center">
            <Link
              href={isVisitor && !account ? "#sign-in" : "/settings"}
              onClick={(event) => {
                if (isVisitor && !account) {
                  event.preventDefault();
                  openLogin({ reason: "signin" });
                }
              }}
              title={
                account
                  ? `${account.name}${account.username ? " · @" + account.username : ""} · ${account.role}`
                  : isVisitor
                    ? "Sign in"
                    : "Account settings"
              }
              aria-label={
                account
                  ? `${account.name}, ${account.role} — account settings`
                  : "Account settings"
              }
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${!account && !isVisitor && !isGuestBrowser ? "animate-pulse bg-overlay" : ""}`}
              style={!account && !isVisitor && !isGuestBrowser ? undefined : avatarTone(accountId || account?.name || "guest")}
            >
              {isStaff && unseenCount > 0 ? (
                <span
                  aria-label={`${unseenCount} chat${unseenCount === 1 ? "" : "s"} nobody from the team has opened`}
                  className="absolute right-0 top-0 h-2 w-2 rounded-full bg-ember"
                />
              ) : null}
              <span aria-hidden="true">
                {account || isVisitor || isGuestBrowser ? initialsFor(account?.name ?? "?") : ""}
              </span>
            </Link>
          </div>
        ) : isVisitor && !account ? (
          <div className="bf-rail-footer mt-auto shrink-0">
            <p className="text-sm font-semibold text-foreground">Keep your work</p>
            <p className="mt-1 text-xs leading-snug text-muted">Sign in to save chats, bring your team and specialists in, and pick up on any device. Free, no card.</p>
            <button
              type="button"
              onClick={() => openLogin({ reason: "signin" })}
              className="mt-3 w-full rounded-xl bg-ember px-3 py-2.5 text-center text-sm font-semibold text-background transition hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        ) : (
          <div className="bf-rail-footer mt-auto shrink-0 relative">
            {/* Staff pickup badge: real per-chat operational signal, not a platform statistic. */}
            {isStaff && newChatCount > 0 ? (
              <p className="mb-2 rounded-full bg-ember/15 px-2 py-0.5 text-center text-[9px] uppercase tracking-[0.15em] text-ember">
                {newChatCount} new chat{newChatCount === 1 ? "" : "s"}
              </p>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-3 cursor-pointer text-left"
              onClick={() => setDropdownOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDropdownOpen(false);
              }}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
            >
              {!account && !isGuestBrowser ? (
                /* Signed in, account still loading: a fixed-size skeleton, so the card never
                   flashes placeholder text or shifts when the real name arrives. */
                <>
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-overlay" aria-hidden="true" />
                  <span className="min-w-0 flex-1 space-y-1.5" aria-hidden="true">
                    <span className="block h-3.5 w-24 animate-pulse rounded bg-overlay" />
                    <span className="block h-2.5 w-14 animate-pulse rounded bg-overlay" />
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={avatarTone(accountId || account?.name || "guest")}
                    aria-hidden="true"
                  >
                    {initialsFor(account?.name ?? "?")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {account?.name ?? "Guest"}
                    </span>
                    {account?.username ? (
                      <span className="block truncate text-[11px] text-muted">
                        @{account.username}
                      </span>
                    ) : null}
                    <span className="block truncate text-[10px] uppercase tracking-[0.15em] text-muted">
                      {account ? account.role : "Not saved yet"}
                    </span>
                  </span>
                </>
              )}
            </button>
            {dropdownOpen ? (
              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-line bg-panel p-3 shadow-xl">
                {isGuestBrowser && !account ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      openLogin({ reason: "save" });
                    }}
                    className="mb-1 block w-full rounded-lg bg-ember px-3 py-2 text-center text-sm font-semibold text-background transition hover:opacity-90"
                  >
                    Save my chats
                  </button>
                ) : null}
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-overlay hover:text-foreground"
                >
                  Settings
                </Link>
<div className="border-t border-line pt-2">
                   <p className="px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-muted">
                     Learn more
                   </p>
                  {[
                    { label: 'About BrandForge', href: '/about' },
                    { label: 'Features', href: '/features' },
                    { label: 'Platform', href: '/platform' },
                    { label: 'Blog', href: '/blog' },
                    { label: 'Privacy Policy', href: '/privacy' },
                    { label: 'Terms of Service', href: '/terms' },
                    { label: 'Payments & refunds', href: '/refunds' },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-overlay hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-line pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      void handleSignOut();
                    }}
                    className="bf-action bf-action-danger bf-action-compact w-full text-left"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
