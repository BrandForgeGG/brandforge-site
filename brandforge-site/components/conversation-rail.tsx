'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSessionUser } from '@/lib/browser-auth';
import { getUserRoleFromEmail } from '@/lib/user-roles';
import { usePresenceCounts } from '@/lib/presence';

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

// Registered and staff accounts come from the server; "online" is live presence, not a DB count.
export interface PlatformCounts {
  registered: number | null;
  staff: number | null;
}

// Recents show real timestamps from persisted messages, never a hardcoded "Just now".
export function relativeTime(value: string | null): string {
  if (!value) {
    return 'no activity';
  }

  const then = new Date(value).getTime();

  if (Number.isNaN(then)) {
    return 'no activity';
  }

  const diffMinutes = Math.round((Date.now() - then) / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return diffMinutes + 'm ago';
  if (diffMinutes < 60 * 24) return Math.round(diffMinutes / 60) + 'h ago';
  if (diffMinutes < 60 * 24 * 7) return Math.round(diffMinutes / (60 * 24)) + 'd ago';

  return new Date(then).toLocaleDateString();
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1d20] px-3 py-2">
      <p className="text-lg font-medium leading-tight text-[#ece7de]">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-[0.15em] text-[#6f757b]">{label}</p>
    </div>
  );
}


export function ConversationRail({
  recents: recentsProp,
  activeConversationId = '',
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
  const [counts, setCounts] = useState<PlatformCounts | null>(null);
  const [account, setAccount] = useState<{ name: string; email: string; role: string } | null>(null);
  const [accountId, setAccountId] = useState('');
  const [isSelfStaff, setIsSelfStaff] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      setAccountId(user.id);
      setAccount({
        name: fullName?.trim() || email.split('@')[0],
        email,
        role: getUserRoleFromEmail(email),
      });
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  const [selfRecents, setSelfRecents] = useState<RecentConversation[] | null>(null);

  const loadSelfRecents = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations-list');
      if (!response.ok) return;
      const data = await response.json();
      setSelfRecents(Array.isArray(data.conversations) ? data.conversations : []);
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
      const response = await fetch('/api/stats');
      if (!response.ok) return;
      const data = await response.json();
      setCounts(data.stats ?? null);
      setIsSelfStaff((current) => current || Boolean(data.isStaff));
    } catch {
      // Counters are informational only; they must never break the rail.
    }
  }, []);

  useEffect(() => {
    // Initial load: loadCounts is async and only sets state after the fetch resolves. The interval
    // keeps the account counters fresh; "online" comes from the presence channel instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCounts();
    const timer = window.setInterval(() => {
      void loadCounts();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [loadCounts]);

  // Live presence: how many tabs are in the app right now, and how many of those belong to staff.
  const presence = usePresenceCounts(
    accountId ? { userId: accountId, staff: isStaffProp ?? isSelfStaff } : null
  );

  const recents = recentsProp ?? selfRecents ?? [];
  const isStaff = isStaffProp ?? isSelfStaff;
  const newChatCount = staffUnseenCountProp ?? unseenCount;
  const onlineLabel = presence.live ? String(presence.online) : '—';
  const staffOnlineLabel = presence.live ? String(presence.staffOnline) : '—';

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // Deleting a chat deletes the project with it (messages, requirements, proposal, milestones,
  // agreement, payments). Two taps: pick the row, then confirm.
  async function handleDeleteConversation(conversationId: string) {
    setDeletingId(conversationId);
    setNotice(null);

    try {
      const response = await fetch('/api/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'The conversation could not be deleted');
      }

      setPendingDeleteId(null);

      if (recentsProp === undefined) {
        setSelfRecents((current) =>
          (current ?? []).filter((conversation) => conversation.id !== conversationId)
        );
      }

      onConversationDeleted?.(conversationId);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'The conversation could not be deleted');
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
          'fixed inset-y-0 left-0 z-40 h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-[#111417] md:sticky md:top-0 md:z-auto md:flex ' +
          (isMobileOpen ? 'flex' : 'hidden')
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
          <Link
            href="/"
            onClick={onMobileClose}
            className="font-serif text-lg tracking-tight text-[#ece7de]"
          >
            Brand<span className="text-[#e8571e]">Forge</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="rounded-lg p-2 text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span aria-hidden="true">{isCollapsed ? '>>' : '<<'}</span>
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
                router.push('/chat');
              }
            }}
            disabled={isCreatingConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8571e] px-4 py-3 text-sm font-semibold text-[#14171a] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-lg leading-none">+</span>
            {isCreatingConversation ? 'Starting...' : 'New Chat'}
          </button>
        </div>

        {isCollapsed ? null : (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">







            <section className="min-h-0 flex-1">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Recents</p>

              {recents.length === 0 ? (
                <p className="text-xs leading-relaxed text-[#6f757b]">
                  Conversations appear here once you send a first message.
                </p>
              ) : (
                <div className="space-y-1">
                  {recents.map((conversation) => {
                    const isActive = conversation.id === activeConversationId;
                    const isPendingDelete = pendingDeleteId === conversation.id;

                    return (
                      <div
                        key={conversation.id}
                        className={
                          'rounded-lg transition ' + (isActive ? 'bg-white/10' : 'hover:bg-white/5')
                        }
                      >
                        <div className="flex items-start gap-2 px-3 py-2">
                          <Link
                            href={'/chat?conversationId=' + conversation.id}
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
                              <span className="truncate">{conversation.title}</span>
                            </p>
                            <p className="mt-0.5 flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-[#6f757b]">
                              <span>{relativeTime(conversation.lastActivity)}</span>
                              <span>
                                {conversation.staffViewedBy
                                  ? 'team in chat'
                                  : conversation.messageCount + ' msg'}
                              </span>
                            </p>
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setPendingDeleteId(isPendingDelete ? null : conversation.id);
                            }}
                            aria-label={'Delete ' + conversation.title}
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
                                  void handleDeleteConversation(conversation.id);
                                }}
                                className="rounded-md border border-red-400/40 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-red-200 disabled:opacity-50"
                              >
                                {deletingId === conversation.id ? 'Deleting…' : 'Delete'}
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

        {isCollapsed ? null : (
          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa0a6]">Platform</p>
              {isStaff && newChatCount > 0 ? (
                <span className="rounded-full bg-[#e8571e]/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] text-[#e8571e]">
                  {newChatCount} new chat{newChatCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Users" value={counts?.registered ?? '—'} />
              <Stat label="Online" value={onlineLabel} />
              <Stat label="Staff on" value={staffOnlineLabel} />
            </div>
            {notice ? (
              <p className="mt-2 text-[10px] leading-relaxed text-red-200">{notice}</p>
            ) : null}
          </div>
        )}

        <div className="mt-auto shrink-0 border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8571e]/15 text-xs font-semibold text-[#e8571e]">
              BF
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#ece7de]">
                {account?.name ?? 'BrandForge'}
              </p>
              <p className="truncate text-[10px] uppercase tracking-[0.15em] text-[#6f757b]">
                {account ? account.role : 'Signed in'}
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
              className="rounded-lg border border-white/10 px-3 py-1.5 text-center text-xs text-[#9aa0a6] transition hover:border-red-400/40 hover:text-red-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

