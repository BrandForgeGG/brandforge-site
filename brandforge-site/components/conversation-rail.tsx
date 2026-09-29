"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAuthed, getSessionUser } from "@/lib/browser-auth";
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
}

// Recents show real timestamps from persisted messages, never a hardcoded "Just now".
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
    telegramConnected,
    onTelegramConnect,
    telegramCode,
    telegramBotUrl,
  }: {
    recents?: RecentConversation[];
    activeConversationId?: string;
    onNewChat?: () => void;
    isCreatingConversation?: boolean;
    isMobileOpen: boolean;
    onMobileClose: () => void;
    isStaff?: boolean;
    staffUnseenCount?: number;
    telegramConnected?: boolean;
    onTelegramConnect?: () => void;
    telegramCode?: string;
    telegramBotUrl?: string;
  }) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [telegramCodeCopied, setTelegramCodeCopied] = useState(false);
  const [account, setAccount] = useState<{
    name: string;
    email: string;
    role: string;
    username: string | null;
  } | null>(null);
  const [accountId, setAccountId] = useState("");
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
        role: account?.role ?? 'user',
        username,
      });
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [account?.role]);

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
          className="fixed inset-0 z-30 cursor-default bg-black/60 md:hidden"
        />
      ) : null}

      <aside
        className={
          "fixed inset-y-0 left-0 z-40 h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-[#111417] md:sticky md:top-0 md:z-auto md:flex " +
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
            className="font-serif text-lg tracking-tight text-[#ece7de]"
          >
            {isCollapsed ? (
              <span aria-hidden="true">
                B<span className="text-[#e8571e]">F</span>
              </span>
            ) : (
              <>
                Brand<span className="text-[#e8571e]">Forge</span>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-lg p-2 text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span aria-hidden="true">{isCollapsed ? ">>" : "<<"}</span>
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

        {isCollapsed ? (
          /* Collapsed rail: recents stay one click away as letter chips with tooltips. */
          <nav
            aria-label="Recent conversations"
            className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 pb-4"
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
                      ? "bg-white/10 text-[#ece7de]"
                      : "text-[#8f959b] hover:bg-white/5 hover:text-[#ece7de]")
                  }
                >
                  {isStaff && conversation.isUnseen ? (
                    <span
                      aria-label="Nobody from the team has opened this chat yet"
                      className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#e8571e]"
                    />
                  ) : null}
                  <span aria-hidden="true">{letter}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        {isCollapsed ? null : (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
            {isAdmin ? (
              <section>
                <p className="bf-rail-section-label">Admin</p>
                <div className="flex flex-col gap-1">
                  <Link
                    href="/admin/applications"
                    onClick={onMobileClose}
                    className="rounded-lg px-3 py-2 text-sm text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
                  >
                    Applications
                  </Link>
                  <Link
                    href="/admin/funnel"
                    onClick={onMobileClose}
                    className="rounded-lg px-3 py-2 text-sm text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
                  >
                    Funnel
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="min-h-0 flex-1">
              <p className="bf-rail-section-label">Recents</p>

              {recents.length === 0 ? (
                <p className="text-xs leading-relaxed text-[#8f959b]">
                  Your first chat appears here the moment you send a message -
                  just start typing in the message box.
                </p>
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
                            <p className="flex items-center gap-1.5 text-sm text-[#ece7de]">
                              {isStaff && conversation.isUnseen ? (
                                <span
                                  aria-label="Nobody from the team has opened this chat yet"
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8571e]"
                                />
                              ) : null}
                              <span className="truncate">
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
              href="/settings"
              title={
                account
                  ? `${account.name}${account.username ? " · @" + account.username : ""} · ${account.role}`
                  : "Account settings"
              }
              aria-label={
                account
                  ? `${account.name}, ${account.role} — account settings`
                  : "Account settings"
              }
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={avatarTone(accountId || account?.name || "guest")}
            >
              {isStaff && unseenCount > 0 ? (
                <span
                  aria-label={`${unseenCount} chat${unseenCount === 1 ? "" : "s"} nobody from the team has opened`}
                  className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#e8571e]"
                />
              ) : null}
              <span aria-hidden="true">
                {initialsFor(account?.name ?? "?")}
              </span>
            </Link>
          </div>
        ) : (
          <div className="bf-rail-footer mt-auto shrink-0 relative">
            {/* Staff pickup badge: real per-chat operational signal, not a platform statistic. */}
            {isStaff && newChatCount > 0 ? (
              <p className="mb-2 rounded-full bg-[#e8571e]/15 px-2 py-0.5 text-center text-[9px] uppercase tracking-[0.15em] text-[#e8571e]">
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
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={avatarTone(accountId || account?.name || "guest")}
                aria-hidden="true"
              >
                {initialsFor(account?.name ?? "?")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[#ece7de]">
                  {account?.name ?? "BrandForge"}
                </span>
                {account?.username ? (
                  <span className="block truncate text-[11px] text-[#9aa0a6]">
                    @{account.username}
                  </span>
                ) : null}
                <span className="block truncate text-[10px] uppercase tracking-[0.15em] text-[#8f959b]">
                  {account ? account.role : "Signed in"}
                </span>
              </span>
            </button>
            {dropdownOpen ? (
              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-white/10 bg-[#1c2024] p-3 shadow-xl">
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
                >
                  Settings
                </Link>
<div className="border-t border-white/10 pt-2">
                   <p className="px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#8f959b]">
                     Learn more
                   </p>
                  {[
                    { label: 'About BrandForge', href: '/about' },
                    { label: 'Privacy Policy', href: '/privacy' },
                    { label: 'Terms of Service', href: '/terms' },
                    { label: 'Payments & refunds', href: '/refunds' },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-white/10 pt-2">
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
            {telegramConnected !== true ? (
              telegramCode ? (
                <div className="mt-2 rounded-lg border border-[#e8571e]/30 bg-[#e8571e]/10 px-3 py-2 text-xs text-[#e8571e]">
                  <p className="mb-1.5 leading-snug text-[#c9b8a8]">
                    Paste this code in the bot to get project updates in Telegram:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="select-all font-mono text-sm font-bold tracking-[0.2em] text-[#ece7de]">
                      {telegramCode}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(telegramCode).then(() => {
                          setTelegramCodeCopied(true);
                          setTimeout(() => setTelegramCodeCopied(false), 1500);
                        });
                      }}
                      className="ml-auto rounded border border-[#e8571e]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition hover:bg-[#e8571e]/20"
                    >
                      {telegramCodeCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  {telegramBotUrl ? (
                    <a
                      href={telegramBotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 font-semibold underline-offset-2 transition hover:underline"
                    >
                      <span aria-hidden="true">✈</span> Open the bot
                    </a>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void onTelegramConnect?.()}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
                >
                  <span aria-hidden="true">✈</span> Connect Telegram
                </button>
              )
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
