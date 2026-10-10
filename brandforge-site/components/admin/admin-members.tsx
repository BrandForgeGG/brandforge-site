'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Member = { id: string; name: string; email: string | null; username: string | null; role: string; createdAt: string | null; isTest: boolean };

const ROLES: [string, string, string][] = [
  ['user', 'Member', 'A regular account'],
  ['operator', 'BrandForge team', 'Joins chats, sends proposals, works on briefs'],
  ['admin', 'Admin', 'Full access, including this dashboard'],
];

// Everyone who has an account, with the role each one has. Pick a role from the list to change it; changing it
// to Admin asks first. You cannot change your own role, and the last admin cannot be demoted.
export function AdminMembers() {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchAuthed(`/api/admin/members?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json().catch(() => ({}));
      setMembers(res.ok ? (data.members ?? []) : []);
    } catch {
      setMembers([]);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function change(member: Member, role: string) {
    if (role === member.role) return;
    const label = ROLES.find(([id]) => id === role)?.[1] ?? role;
    if (role === 'admin' && !window.confirm(`Make ${member.name} an admin? They will be able to see and change everything on this dashboard.`)) return;
    if (member.role === 'admin' && !window.confirm(`Take admin access away from ${member.name}?`)) return;
    setBusyId(member.id);
    setNote(null);
    try {
      const res = await fetchAuthed('/api/admin/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: member.id, role }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNote({ tone: 'error', text: data.error || 'Could not change the role.' });
      setNote({ tone: 'ok', text: `${member.name} is now ${label}.${data.emailed === true ? ' We emailed them.' : data.emailed === false ? ' The email could not be sent.' : ''}` });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function resendWelcome(member: Member) {
    setBusyId(member.id);
    setNote(null);
    try {
      const res = await fetchAuthed('/api/admin/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: member.id, role: 'operator', resend: true }) });
      const data = await res.json().catch(() => ({}));
      setNote(res.ok && data.emailed === true ? { tone: 'ok', text: `Welcome email sent to ${member.email}.` } : { tone: 'error', text: data.error || 'The email could not be sent.' });
    } finally {
      setBusyId(null);
    }
  }

  const shown = (members ?? []).filter((member) => showTest || !member.isTest);

  return (
    <section className="border-t border-line pt-6" aria-label="Members and roles">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-foreground">Members and roles</h2>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={showTest} onChange={(event) => setShowTest(event.target.checked)} />
          Show test accounts
        </label>
      </div>
      <p className="mt-1 text-xs text-muted">Give someone a role: Member, BrandForge team or Admin. Accepting an application adds the person to the BrandForge team for you.</p>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or username" aria-label="Search members" className="mt-3 w-full max-w-sm rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
      {note ? <p role="status" className={`mt-2 text-sm ${note.tone === 'error' ? 'text-danger' : 'text-foreground'}`}>{note.text}</p> : null}

      <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-line">
        {members === null ? (
          <p className="px-4 py-6 text-sm text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No members match.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {member.name}
                    {member.username ? <span className="text-muted"> · @{member.username}</span> : null}
                    {member.isTest ? <span className="ml-2 text-xs text-muted">test</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted">{member.email ?? 'no email'}</p>
                </div>
                {member.role === 'operator' ? (
                  <button type="button" disabled={busyId === member.id || !member.email} onClick={() => void resendWelcome(member)} className="ml-auto text-xs text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
                    Send welcome email
                  </button>
                ) : null}
                <select
                  value={member.role}
                  disabled={busyId === member.id}
                  onChange={(event) => void change(member, event.target.value)}
                  aria-label={`Role for ${member.name}`}
                  title={ROLES.find(([id]) => id === member.role)?.[2]}
                  className="rounded-lg border border-line bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
                >
                  {ROLES.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
