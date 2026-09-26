"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/browser-auth";
import { getUserRoleFromEmail } from "@/lib/user-roles";
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
  onConversationDeleted,
}: {
  recents?: RecentConversation[];
  activeConversationId?: string;
  onNewChat?: () => void;
  isCreatingConversation?: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  isStaff?: boolean;
  staffUnseenCount?: number;
  onConversationDeleted?: (conversationId: string) => void;
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
  const [isSelfStaff, setIsSelfStaff] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        const response = await fetch("/api/identity");
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
        role: getUserRoleFromEmail(email),
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
      const response = await fetch("/api/conversations-list");
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
    const timer = window.setInterval(() => {
      void loadSelfRecents();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [recentsProp, selfRecents, loadSelfRecents]);

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/stats");
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

  // Deleting a chat deletes the project with it (messages, requirements, proposal, milestones,
  // agreement, payments). Two taps: pick the row, then confirm.
  async function handleDeleteConversation(conversationId: string) {
    setDeletingId(conversationId);
    setNotice(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "The conversation could not be deleted");
      }

      setPendingDeleteId(null);

      if (recentsProp === undefined) {
        setSelfRecents((current) =>
          (current ?? []).filter(
            (conversation) => conversation.id !== conversationId,
          ),
        );
      }

      onConversationDeleted?.(conversationId);
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "The conversation could not be deleted",
      );
    } finally {
      setDeletingId(null);
    }
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
              const letter = (
                conversation.title.trim().charAt(0) || "?"
              ).toUpperCase();
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
                      : "text-[#6f757b] hover:bg-white/5 hover:text-[#ece7de]")
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
                <p className="text-xs leading-relaxed text-[#6f757b]">
                  Conversations appear here once you send a first message.
                </p>
              ) : (
                <div className="bf-recents">
                  {recents.map((conversation) => {
                    const isActive = conversation.id === activeConversationId;
                    const isPendingDelete = pendingDeleteId === conversation.id;

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
                            <p className="mt-0.5 flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-[#6f757b]">
                              <span>
                                {relativeTime(conversation.lastActivity)}
                              </span>
                              <span>
                                {conversation.staffViewedBy
                                  ? "specialist in chat"
                                  : conversation.messageCount + " msg"}
                              </span>
                            </p>
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setPendingDeleteId(
                                isPendingDelete ? null : conversation.id,
                              );
                            }}
                            aria-label={"Delete " + conversation.title}
                            className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-[#6f757b] transition hover:bg-white/5 hover:text-red-200"
                          >
                            ✕
                          </button>
                        </div>

                        {isPendingDelete ? (
                          <div className="flex items-center justify-between gap-2 px-3 pb-2">
                            <span className="text-[10px] uppercase tracking-[0.15em] text-[#9aa0a6]">
                              Delete chat?
                            </span>
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={deletingId === conversation.id}
                                onClick={() => {
                                  void handleDeleteConversation(
                                    conversation.id,
                                  );
                                }}
                                className="rounded-md border border-red-400/40 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-red-200 disabled:opacity-50"
                              >
                                {deletingId === conversation.id
                                  ? "Deleting…"
                                  : "Delete"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(null)}
                                className="rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-[#9aa0a6]"
                              >
                                Cancel
                              </button>
                            </span>
                          </div>
                        ) : null}
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
          <div className="bf-rail-footer mt-auto shrink-0">
            {/* Staff pickup badge: real per-chat operational signal, not a platform statistic. */}
            {isStaff && newChatCount > 0 ? (
              <p className="mb-2 rounded-full bg-[#e8571e]/15 px-2 py-0.5 text-center text-[9px] uppercase tracking-[0.15em] text-[#e8571e]">
                {newChatCount} new chat{newChatCount === 1 ? "" : "s"}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={avatarTone(accountId || account?.name || "guest")}
                aria-hidden="true"
              >
                {initialsFor(account?.name ?? "?")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#ece7de]">
                  {account?.name ?? "BrandForge"}
                </p>
                {account?.username ? (
                  <p className="truncate text-[11px] text-[#9aa0a6]">
                    @{account.username}
                  </p>
                ) : null}
                <p className="truncate text-[10px] uppercase tracking-[0.15em] text-[#6f757b]">
                  {account ? account.role : "Signed in"}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/settings"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-center text-xs text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                className="bf-action bf-action-danger bf-action-compact"
              >
                Sign out
              </button>
            </div>
            {notice ? (
              <p className="mt-2 text-[10px] leading-relaxed text-red-200">
                {notice}
              </p>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
