'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';

type AdminApplication = {
  id: string;
  user_id: string;
  email: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type ConversationOption = {
  id: string;
  title: string;
};

export default function AdminApplicationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [conversations, setConversations] = useState<ConversationOption[]>([]);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteConversation, setInviteConversation] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/applications');
    if (!response.ok) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setApplications(data.applications ?? []);
    setAllowed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const user = await getSessionUser();

      if (!user) {
        if (!cancelled) {
          router.push('/login');
        }
        return;
      }

      if (cancelled) return;
      await load();

      try {
        const response = await fetch('/api/staff/conversations');
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (!cancelled) {
            setConversations(
              (data.conversations ?? []).map(
                (row: { id: string; title: string }) => ({
                  id: row.id,
                  title: row.title,
                })
              )
            );
          }
        }
      } catch {
        // invite dropdown stays empty
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [load, router]);

  async function act(applicationId: string, action: 'accept' | 'decline') {
    setBusyId(applicationId);
    setError('');

    try {
      const response = await fetch(`/api/admin/applications/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Request failed');
        return;
      }

      await load();
    } catch {
      setError('Request failed');
    } finally {
      setBusyId(null);
    }
  }

  async function invite(applicationId: string) {
    if (!inviteConversation) {
      setError('Pick a conversation first');
      return;
    }

    setBusyId(applicationId);
    setError('');

    try {
      const response = await fetch(`/api/admin/applications/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', conversationId: inviteConversation }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Invite failed');
        return;
      }

      setInviteFor(null);
      setInviteConversation('');
      await load();
    } catch {
      setError('Invite failed');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <AppShell title="Applications" subtitle="Review specialist applications.">
        <p className="text-sm text-muted">Loading applications…</p>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="Applications" subtitle="Review specialist applications.">
        <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
          <h2 className="font-serif text-2xl text-foreground">Admins only</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This page is for BrandForge admins. Sign in with an admin account, or go back to
            chat.
          </p>
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="mt-5 rounded-xl border border-line bg-background px-4 py-2 text-sm text-foreground transition hover:border-ember"
          >
            Back to chat
          </button>
        </div>
      </AppShell>
    );
  }

  const pending = applications.filter((app) => app.status === 'pending');
  const reviewed = applications.filter((app) => app.status !== 'pending');

  return (
    <AppShell title="Applications" subtitle="Review specialist applications.">
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted">
          Pending ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No pending applications.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {pending.map((app) => (
              <li
                key={app.id}
                className="rounded-2xl border border-line bg-panel p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{app.email}</p>
                    <p className="text-xs text-muted">
                      {new Date(app.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void act(app.id, 'accept')}
                      disabled={busyId === app.id}
                      className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(app.id, 'decline')}
                      disabled={busyId === app.id}
                      className="rounded-xl border border-line px-4 py-2 text-sm text-muted transition hover:border-red-500/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInviteFor(inviteFor === app.id ? null : app.id);
                        setError('');
                      }}
                      disabled={busyId === app.id}
                      className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Invite to chat…
                    </button>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-background p-4 text-sm text-foreground">
                  {app.message}
                </p>

                {inviteFor === app.id ? (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="min-w-[240px] flex-1">
                      <label
                        htmlFor={`invite-${app.id}`}
                        className="block text-xs uppercase tracking-[0.15em] text-muted"
                      >
                        Conversation
                      </label>
                      <select
                        id={`invite-${app.id}`}
                        value={inviteConversation}
                        onChange={(e) => setInviteConversation(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
                      >
                        <option value="">Select a conversation…</option>
                        {conversations.map((conversation) => (
                          <option key={conversation.id} value={conversation.id}>
                            {conversation.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void invite(app.id)}
                      disabled={busyId === app.id || !inviteConversation}
                      className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send invite
                    </button>
                    <p className="w-full text-xs text-muted">
                      Accept first — invite adds the specialist to the chat as an operator.
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted">
          Reviewed ({reviewed.length})
        </h2>

        {reviewed.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing reviewed yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reviewed.map((app) => (
              <li
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4"
              >
                <div>
                  <p className="text-sm text-foreground">{app.email}</p>
                  <p className="text-xs text-muted">
                    {app.message.slice(0, 120)}
                    {app.message.length > 120 ? '…' : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.15em] ${
                    app.status === 'accepted'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-success'
                      : 'border-line bg-background text-muted'
                  }`}
                >
                  {app.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
