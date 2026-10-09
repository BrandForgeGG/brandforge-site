'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchAuthed } from '@/lib/browser-auth';

type Item = { title: string; url: string };
type Profile = { handle: string; display_name: string; headline: string; bio: string; skills: string[]; portfolio: Item[]; is_public: boolean };

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';

// Specialists edit their own profile here. Listing it on /specialists is a checkbox they control.
export default function EditSpecialistProfilePage() {
  const [state, setState] = useState<'loading' | 'denied' | 'ready'>('loading');
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState('');
  const [items, setItems] = useState<Item[]>([{ title: '', url: '' }]);
  const [isPublic, setIsPublic] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    fetchAuthed('/api/specialist/profile')
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setState('denied');
        const data = (await res.json()) as { profile: Profile | null; suggestedName: string };
        const p = data.profile;
        setName(p?.display_name || data.suggestedName || '');
        setHandle(p?.handle || '');
        setHeadline(p?.headline || '');
        setBio(p?.bio || '');
        setSkills((p?.skills ?? []).join(', '));
        setItems(p?.portfolio?.length ? p.portfolio : [{ title: '', url: '' }]);
        setIsPublic(Boolean(p?.is_public));
        setState('ready');
      })
      .catch(() => live && setState('denied'));
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetchAuthed('/api/specialist/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, displayName: name, headline, bio, skills, portfolio: items, isPublic }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? { kind: 'ok', text: isPublic ? 'Saved. Your profile is listed.' : 'Saved. Your profile is private.' } : { kind: 'error', text: data.error || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading') return <main className="mx-auto max-w-2xl px-6 py-16 text-sm text-muted">Loading your profile…</main>;
  if (state === 'denied') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-serif text-3xl text-foreground">Specialist profiles</h1>
        <p className="mt-3 text-sm text-muted">Profiles are for approved specialists. <Link href="/apply" className="text-ember underline-offset-2 hover:underline">Apply here</Link>, or <Link href="/login" className="text-ember underline-offset-2 hover:underline">sign in</Link> if you already have access.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/specialists" className="text-sm text-muted transition hover:text-foreground">← Specialists</Link>
      <h1 className="mt-4 font-serif text-3xl text-foreground">Your profile</h1>
      <p className="mt-2 text-sm text-muted">Founders see this when you are listed. Only add work you are happy to show.</p>

      <div className="mt-8 space-y-5">
        <label className="block text-sm text-foreground">Name
          <input className={`${field} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        </label>
        <label className="block text-sm text-foreground">Handle
          <input className={`${field} mt-1.5`} value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={30} placeholder="mira-designs" autoCapitalize="none" />
          <span className="mt-1 block text-xs text-muted">Your page will be at brandforge.gg/specialists/{handle.toLowerCase() || 'your-handle'}</span>
        </label>
        <label className="block text-sm text-foreground">One-line headline
          <input className={`${field} mt-1.5`} value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={100} placeholder="Motion designer for game studios" />
        </label>
        <label className="block text-sm text-foreground">About you
          <textarea className={`${field} mt-1.5 min-h-28`} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1200} placeholder="What you do best, who you have worked with, how you work." />
        </label>
        <label className="block text-sm text-foreground">Skills, separated by commas
          <input className={`${field} mt-1.5`} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="After Effects, Blender, Storyboarding" />
        </label>

        <fieldset>
          <legend className="text-sm text-foreground">Portfolio links</legend>
          <div className="mt-2 space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <input className={field} value={item.title} onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)))} placeholder="Title" aria-label={`Portfolio item ${i + 1} title`} />
                <input className={field} value={item.url} onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, url: e.target.value } : it)))} placeholder="https://" aria-label={`Portfolio item ${i + 1} link`} inputMode="url" />
              </div>
            ))}
          </div>
          {items.length < 8 ? <button type="button" onClick={() => setItems([...items, { title: '', url: '' }])} className="mt-2 text-xs text-ember underline-offset-2 hover:underline">Add another link</button> : null}
        </fieldset>

        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm text-foreground">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>List my profile on brandforge.gg/specialists<span className="mt-0.5 block text-xs text-muted">Leave this off to keep your profile private. You can change it any time.</span></span>
        </label>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">{saving ? 'Saving…' : 'Save profile'}</button>
          {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>{message.text}</p> : null}
        </div>
      </div>
    </main>
  );
}
